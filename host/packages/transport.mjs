import { imageBase } from "../../src/images.mjs";
import { DOLLY_ERRNO as errno } from "../../src/process-constants.mjs";
import * as A from "./abi.mjs";

const capacity = A.DOLLY_PACKAGES_CHUNK_CAPACITY;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();
// Snapshots served per page: enough for every package, not for a loop.
const maxSnapshots = 64;
// The index is one chunk.
const maxIndexBytes = capacity;

// The Worker's end of packages@0's mailbox (dolly-packages-0.wat): it answers
// each request the kernel reports, one chunk at a time, from the page's own
// image directory; another directory is refused until the page's HTTP policy
// judges it here.
export class PackagesTransport {
  constructor(buffer, address) {
    if (!(buffer instanceof SharedArrayBuffer) || !Number.isSafeInteger(address) || address <= 0 || address % 4 ||
        address > buffer.byteLength - A.DOLLY_PACKAGES_CHUNK_OFFSET - capacity) throw new TypeError("invalid packages mailbox");
    this.words = new Int32Array(buffer, address, 16);
    this.directory = new Uint8Array(buffer, address + A.DOLLY_PACKAGES_DIRECTORY_OFFSET, A.DOLLY_PACKAGES_DIRECTORY_CAPACITY);
    this.pin = new Uint8Array(buffer, address + A.DOLLY_PACKAGES_PIN_OFFSET, A.DOLLY_PACKAGES_PIN_BYTES);
    this.bytes = new Uint8Array(buffer, address + A.DOLLY_PACKAGES_CHUNK_OFFSET, capacity);
    this.active = null;
    this.served = 0;
    this.reported = Atomics.load(this.words, A.DOLLY_PACKAGES_WORD_REQUEST);
    this.retiredSeen = Atomics.load(this.words, A.DOLLY_PACKAGES_WORD_CANCELLED);
    Atomics.store(this.words, A.DOLLY_PACKAGES_WORD_ENABLED, 1);
  }

  // At each service tick: a new request is answered, a retired one ends.
  service() {
    const request = Atomics.load(this.words, A.DOLLY_PACKAGES_WORD_REQUEST);
    const cancelled = Atomics.load(this.words, A.DOLLY_PACKAGES_WORD_CANCELLED);
    if (request !== this.reported) {
      this.reported = request;
      void this.answer();
    }
    if (cancelled !== this.retiredSeen) {
      this.retiredSeen = cancelled;
      if (this.active && this.retired(this.active.sequence)) this.active.retire();
    }
  }

  retired(sequence) {
    return Atomics.load(this.words, A.DOLLY_PACKAGES_WORD_REQUEST) !== sequence ||
      Atomics.load(this.words, A.DOLLY_PACKAGES_WORD_CANCELLED) === sequence;
  }

  async answer() {
    const words = this.words, sequence = Atomics.load(words, A.DOLLY_PACKAGES_WORD_REQUEST);
    if (this.active || sequence === Atomics.load(words, A.DOLLY_PACKAGES_WORD_COMPLETED)) return;
    let retire, worker;
    const retirement = new Promise(resolve => { retire = resolve; });
    this.active = { sequence, retire };
    let size = 0;
    const publish = async (bytes, eof, error = 0) => {
      // The kernel notifies the consumed word after writing each chunk.
      for (let consumed; (consumed = Atomics.load(words, A.DOLLY_PACKAGES_WORD_CONSUMED)) !== Atomics.load(words, A.DOLLY_PACKAGES_WORD_CHUNK);) {
        if (this.retired(sequence)) return;
        await Promise.race([Atomics.waitAsync(words, A.DOLLY_PACKAGES_WORD_CONSUMED, consumed).value, retirement]);
      }
      if (this.retired(sequence)) return;
      this.bytes.set(bytes);
      Atomics.store(words, A.DOLLY_PACKAGES_WORD_LENGTH, bytes.length);
      Atomics.store(words, A.DOLLY_PACKAGES_WORD_ERROR, error);
      Atomics.store(words, A.DOLLY_PACKAGES_WORD_EOF, eof ? 1 : 0);
      Atomics.store(words, A.DOLLY_PACKAGES_WORD_SIZE, size);
      Atomics.add(words, A.DOLLY_PACKAGES_WORD_CHUNK, 1);
    };
    const whole = bytes => { size = bytes.length; return publish(bytes, true); };
    const refuse = code => publish(new Uint8Array(), true, code);
    try {
      const kind = Atomics.load(words, A.DOLLY_PACKAGES_WORD_KIND);
      const directory = decoder.decode(this.directory.slice(0, Atomics.load(words, A.DOLLY_PACKAGES_WORD_DIRECTORY_LENGTH)));
      if (kind === A.DOLLY_PACKAGES_KIND_DIRECTORY) return await whole(encoder.encode(imageBase.href));
      if (directory !== imageBase.href) return await refuse(errno.EACCES);
      if (kind === A.DOLLY_PACKAGES_KIND_INDEX) {
        const response = await fetch(new URL("amy-index.txt", imageBase), { credentials: "same-origin", redirect: "error" });
        const length = Number(response.headers.get("content-length") ?? 0);
        if (!response.ok || length > maxIndexBytes) return await refuse(response.ok ? errno.EFBIG : errno.ENOENT);
        const bytes = new Uint8Array(await response.arrayBuffer());
        return await (bytes.length > maxIndexBytes ? refuse(errno.EFBIG) : whole(bytes));
      }
      if (this.served >= maxSnapshots) return await refuse(errno.EDQUOT);
      // The packages Worker (worker.mjs) finds the package and merges its
      // checked packs into its snapshot, a chunk per message.
      worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module", name: "dolly-packages" });
      const ask = message => new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => data.error === undefined ? resolve(data) : reject(new Error(data.error));
        worker.onerror = event => { event.preventDefault(); reject(new Error(event.message || "package Worker failed")); };
        worker.postMessage(message);
      });
      const found = await ask({ directory, sha256: decoder.decode(this.pin.slice()) });
      if (found.missing) return await refuse(errno.ENOENT);
      if (!Number.isSafeInteger(found.size) || found.size <= 0 || found.size > A.DOLLY_PACKAGES_MAX_SIZE) return await refuse(errno.EFBIG);
      // A package found counts against the quota; a miss does not.
      this.served += 1;
      size = found.size;
      let sent = 0;
      for (;;) {
        const { done, value } = await ask({});
        if (done) break;
        for (let offset = 0; offset < value.length; offset += capacity) {
          const piece = value.subarray(offset, Math.min(value.length, offset + capacity));
          sent += piece.length;
          await publish(piece, sent === size);
          if (this.retired(sequence)) return;
        }
      }
      if (sent !== size) await refuse(errno.EIO);
    } catch {
      await refuse(errno.EIO);
    } finally {
      worker?.terminate();
      Atomics.store(words, A.DOLLY_PACKAGES_WORD_COMPLETED, sequence);
      this.active = null;
    }
  }

  close() { Atomics.store(this.words, A.DOLLY_PACKAGES_WORD_ENABLED, 0); this.active?.retire(); }
}
