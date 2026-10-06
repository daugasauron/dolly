import { DOLLY_SESSION_MAX_BYTES, validSessionName } from "../../src/session-store.mjs";
import { DOLLY_ERRNO } from "../../src/process-constants.mjs";
import * as A from "./abi.mjs";

// The mailbox words as dolly-snapshot-0.wat names them. No filesystem paths
// cross here. wake asks the kernel to serve the mailbox: on a request, after
// each consumed chunk and on cancellation; the kernel thread never waits for
// this page.
export class SessionTransport {
  static requestSequence = A.DOLLY_SESSION_WORD_REQUEST_SEQUENCE;
  static completedSequence = A.DOLLY_SESSION_WORD_COMPLETED_SEQUENCE;
  static status = A.DOLLY_SESSION_WORD_STATUS;
  static nameLength = A.DOLLY_SESSION_WORD_NAME_LENGTH;
  static chunkSequence = A.DOLLY_SESSION_WORD_CHUNK_SEQUENCE;
  static chunkConsumedSequence = A.DOLLY_SESSION_WORD_CHUNK_CONSUMED_SEQUENCE;
  static chunkLength = A.DOLLY_SESSION_WORD_CHUNK_LENGTH;
  static chunkEof = A.DOLLY_SESSION_WORD_CHUNK_EOF;
  static totalSizeLow = A.DOLLY_SESSION_WORD_TOTAL_SIZE_LOW;
  static totalSizeHigh = A.DOLLY_SESSION_WORD_TOTAL_SIZE_HIGH;
  static cancelledSequence = A.DOLLY_SESSION_WORD_CANCELLED_SEQUENCE;

  constructor(buffer, address, nameAddress, transferAddress, wake) {
    const range = (start, size) => Number.isSafeInteger(start) && start > 0 && start <= buffer.byteLength - size;
    if (!(buffer instanceof SharedArrayBuffer) || !range(address, A.DOLLY_SESSION_HEADER_SIZE) || address % 4 ||
        !range(nameAddress, A.DOLLY_SESSION_NAME_CAPACITY) || !range(transferAddress, A.DOLLY_SESSION_TRANSFER_CAPACITY)) {
      throw new Error("Dolly supplied an invalid session mailbox");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer, address, A.DOLLY_SESSION_HEADER_SIZE / 4);
    this.nameAddress = nameAddress;
    this.nameCapacity = A.DOLLY_SESSION_NAME_CAPACITY;
    this.transferAddress = transferAddress;
    this.transferCapacity = A.DOLLY_SESSION_TRANSFER_CAPACITY;
    this.wake = wake;
    this.closed = false;
    this.cancel = null;
  }

  async capture(name, { signal, timeoutMilliseconds = 30000, onChunk } = {}) {
    if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
    if (onChunk !== undefined && typeof onChunk !== "function") throw new TypeError("invalid session consumer");
    signal?.throwIfAborted();
    if (this.closed) throw new Error("Snapshot provider closed");
    const words = this.words;
    const published = Atomics.load(words, SessionTransport.requestSequence);
    if (published !== Atomics.load(words, SessionTransport.completedSequence)) {
      throw new Error("A Dolly session save is already active");
    }
    const requested = (published + 1) | 0;
    let chunkSequence = Atomics.load(words, SessionTransport.chunkSequence);
    let deadline = performance.now() + timeoutMilliseconds;
    const wait = async (index, ready) => {
      for (;;) {
        signal?.throwIfAborted();
        if (this.closed) throw new Error("Snapshot provider closed");
        // Compare and wait on the SAME observation: a publication between
        // these operations makes waitAsync return not-equal, never a lost wake.
        const observed = Atomics.load(words, index);
        if (ready(observed)) return observed;
        if (performance.now() >= deadline) throw new Error("Session save timed out; try again");
        if (index === SessionTransport.chunkSequence &&
            Atomics.load(words, SessionTransport.completedSequence) === requested) {
          throw new Error("Dolly stopped the session transfer before it completed");
        }
        const waiting = Atomics.waitAsync(words, index, observed, 1000);
        if (waiting.async) await waiting.value;
      }
    };
    const cancel = () => {
      Atomics.store(words, SessionTransport.cancelledSequence, requested);
      // Wake this capture's own waits, and the kernel.
      Atomics.notify(words, SessionTransport.chunkSequence);
      Atomics.notify(words, SessionTransport.completedSequence);
      this.wake();
    };
    this.cancel = cancel;
    signal?.addEventListener("abort", cancel, { once: true });
    let complete = false;
    try {
      const nameBytes = new TextEncoder().encode(name);
      this.bytes.fill(0, this.nameAddress, this.nameAddress + this.nameCapacity);
      this.bytes.set(nameBytes, this.nameAddress);
      Atomics.store(words, SessionTransport.nameLength, nameBytes.length);
      Atomics.store(words, SessionTransport.requestSequence, requested);
      this.wake();
      let snapshot;
      let offset = 0;
      let declaredTotal;
      for (;;) {
        const chunk = await wait(SessionTransport.chunkSequence, (value) => value !== chunkSequence);
        if (chunk !== ((chunkSequence + 1) | 0)) throw new Error("Dolly session chunk sequence skipped");
        const length = Atomics.load(words, SessionTransport.chunkLength) >>> 0;
        const eof = Atomics.load(words, SessionTransport.chunkEof);
        const total = (Atomics.load(words, SessionTransport.totalSizeHigh) >>> 0) * 2 ** 32 +
          (Atomics.load(words, SessionTransport.totalSizeLow) >>> 0);
        if (!Number.isSafeInteger(total) || total > DOLLY_SESSION_MAX_BYTES ||
            (total !== 0 && total < 16) || (declaredTotal !== undefined && declaredTotal !== total) ||
            length > this.transferCapacity || length > total - offset ||
            (eof !== 0 && eof !== 1) || (!eof && length === 0)) {
          throw new Error("Dolly published an invalid session chunk");
        }
        if (declaredTotal === undefined) {
          declaredTotal = total;
          if (!onChunk) snapshot = new Uint8Array(total);
        }
        const bytes = this.bytes.subarray(this.transferAddress, this.transferAddress + length);
        if (onChunk) await onChunk(bytes.slice());
        else snapshot.set(bytes, offset);
        offset += length;
        Atomics.store(words, SessionTransport.chunkConsumedSequence, chunk);
        this.wake();
        chunkSequence = chunk;
        deadline = performance.now() + timeoutMilliseconds;
        if (eof) break;
      }
      await wait(SessionTransport.completedSequence, (value) => value === requested);
      const status = Atomics.load(words, SessionTransport.status);
      if (status === -DOLLY_ERRNO.EFBIG) {
        throw new Error(`Dolly session exceeds its ${DOLLY_SESSION_MAX_BYTES / 1024 / 1024} MiB limit; remove files or installed packages and save again`);
      }
      if (status !== 0) throw new Error(`Dolly session capture failed with status ${status}`);
      if (offset < 16 || offset !== declaredTotal) throw new Error("Dolly session snapshot was incomplete");
      complete = true;
      return onChunk ? offset : snapshot.buffer;
    } finally {
      if (!complete) cancel();
      signal?.removeEventListener("abort", cancel);
      this.cancel = null;
    }
  }
  close() { this.closed = true; this.cancel?.(); }
}
