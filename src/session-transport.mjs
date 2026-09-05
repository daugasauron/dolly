import { DOLLY_SESSION_MAX_BYTES, validSessionName } from "./session-store.mjs";

// Mailbox v2, mirrored by session-snapshot.c. No filesystem paths cross here.
export class SessionTransport {
  static requestSequence = 0;
  static completedSequence = 1;
  static status = 2;
  static nameLength = 3;
  static chunkSequence = 4;
  static chunkConsumedSequence = 5;
  static chunkLength = 6;
  static chunkEof = 7;
  static totalSizeLow = 8;
  static totalSizeHigh = 9;
  static cancelledSequence = 10;

  constructor(buffer, address, nameAddress, nameCapacity,
              transferAddress, transferCapacity, displayTransport) {
    const range = (start, size) => Number.isSafeInteger(start) && start > 0 &&
      Number.isSafeInteger(size) && size > 0 && start <= buffer.byteLength - size;
    if (!(buffer instanceof SharedArrayBuffer) || !range(address, 64) || address % 4 ||
        !range(nameAddress, nameCapacity) || nameCapacity < 65 ||
        !range(transferAddress, transferCapacity) || transferCapacity !== 1024 * 1024) {
      throw new Error("Dolly supplied an invalid session mailbox");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer, address, 16);
    this.nameAddress = nameAddress;
    this.nameCapacity = nameCapacity;
    this.transferAddress = transferAddress;
    this.transferCapacity = transferCapacity;
    this.displayTransport = displayTransport;
  }

  async capture(name, { signal, timeoutMilliseconds = 30000 } = {}) {
    if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
    signal?.throwIfAborted();
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
      Atomics.notify(words, SessionTransport.chunkConsumedSequence);
      Atomics.notify(words, SessionTransport.chunkSequence);
      Atomics.notify(words, SessionTransport.completedSequence);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    let complete = false;
    try {
      const nameBytes = new TextEncoder().encode(name);
      this.bytes.fill(0, this.nameAddress, this.nameAddress + this.nameCapacity);
      this.bytes.set(nameBytes, this.nameAddress);
      Atomics.store(words, SessionTransport.nameLength, nameBytes.length);
      Atomics.store(words, SessionTransport.requestSequence, requested);
      this.displayTransport.wake();
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
          snapshot = new Uint8Array(total);
        }
        snapshot.set(this.bytes.subarray(this.transferAddress, this.transferAddress + length), offset);
        offset += length;
        Atomics.store(words, SessionTransport.chunkConsumedSequence, chunk);
        Atomics.notify(words, SessionTransport.chunkConsumedSequence);
        chunkSequence = chunk;
        deadline = performance.now() + timeoutMilliseconds;
        if (eof) break;
      }
      await wait(SessionTransport.completedSequence, (value) => value === requested);
      const status = Atomics.load(words, SessionTransport.status);
      if (status !== 0) throw new Error(`Dolly session capture failed with status ${status}`);
      if (offset < 16 || offset !== snapshot.byteLength) throw new Error("Dolly session snapshot was incomplete");
      complete = true;
      return snapshot.buffer;
    } finally {
      if (!complete) cancel();
      signal?.removeEventListener("abort", cancel);
    }
  }
}
