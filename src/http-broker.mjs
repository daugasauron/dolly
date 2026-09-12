import { HttpError, isDollyCredentialHeader, stripDollyBrowserOwnedHeaders } from "./http-policy.mjs";
import { DOLLY_ERRNO as errno } from "../dist/dolly-errno.mjs";
import { decodeStaticAsset } from "./static-asset.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export const DOLLY_HTTP_MAILBOX_VERSION = 5;
export const DOLLY_HTTP_SLOT_COUNT = 16;
export const DOLLY_HTTP_LIMITS = Object.freeze({ method: 32, url: 8192, headers: 65536, body: 8 * 1024 * 1024 });

// Host-only acknowledgement: admission copies or rejects the spans before the
// import returns. One descriptor at a time, but independent streaming transfers.
export function createHttpAdmission(postRequest) {
  const control = new Int32Array(new SharedArrayBuffer(8));
  return { control, dispatch(request) {
    Atomics.store(control, 0, 1);
    postRequest(request);
    while (Atomics.load(control, 0) !== 0) Atomics.wait(control, 0, 1);
    return Atomics.load(control, 1);
  } };
}

export class NetworkTransport {
  static headerSize = 64;
  static state = 0;
  static sequence = 1;
  static status = 2;
  static length = 3;
  static eof = 4;
  static error = 5;
  static kind = 6;

  constructor(buffer, address, capacity, policy, {
    fetchRequest = globalThis.fetch.bind(globalThis),
    baseURL = globalThis.location?.href,
  } = {}) {
    if (!(buffer instanceof SharedArrayBuffer) || !Number.isSafeInteger(address) ||
        address <= 0 || address % 64 !== 0 || capacity !== 65536 ||
        address > buffer.byteLength - DOLLY_HTTP_SLOT_COUNT * (NetworkTransport.headerSize + capacity)) {
      throw new TypeError("invalid HTTP mailbox pool bounds");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.capacity = capacity;
    this.policy = policy;
    this.fetchRequest = fetchRequest;
    this.baseURL = baseURL;
    // Host bookkeeping, never derived from a guest's claimed active count.
    this.slots = Array(DOLLY_HTTP_SLOT_COUNT).fill(null);
    this.closed = false;
    this.requestCount = 0;
    this.completedRequestCount = 0;
  }

  get active() { return this.slots.some(slot => slot !== null); }

  slotIndex(sequence) {
    if (!Number.isInteger(sequence) || sequence <= 0 || sequence > 0xffffffff)
      throw new HttpError(errno.EINVAL, "invalid HTTP handle");
    return (sequence - 1) % DOLLY_HTTP_SLOT_COUNT;
  }

  // All spans are checked before decoding/copying ANY guest bytes.
  async dispatch(message) {
    try {
      if (this.closed) return -errno.ECANCELED;
      const sequence = message.sequence >>> 0;
      const index = this.slotIndex(sequence);
      if (message.method === 0n) {
        if (message.methodSize !== 0n || message.url !== 0n || message.urlSize !== 0n ||
            message.headers !== 0n || message.headersSize !== 0n ||
            message.body !== 0n || message.bodySize !== 0n || message.flags !== 0)
          throw new HttpError(errno.EINVAL, "invalid HTTP cancellation");
        const transfer = this.slots[index];
        if (transfer && transfer.sequence !== sequence) return -errno.ESTALE;
        transfer?.cancel();
        return 0;
      }
      if (this.slots[index]) return -errno.EBUSY;
      if (!(message.memory instanceof SharedArrayBuffer) || (message.flags & ~3) !== 0)
        throw new HttpError(errno.EINVAL, "invalid HTTP admission");
      const spans = {};
      for (const [name, maximum] of Object.entries(DOLLY_HTTP_LIMITS)) {
        const start = Number(message[name]), size = Number(message[`${name}Size`]);
        if (!Number.isSafeInteger(size) || size < 0 || size > maximum)
          throw new HttpError(errno.E2BIG, "HTTP argument exceeds its byte limit");
        if (!Number.isSafeInteger(start) || start < 0 || (size !== 0 && start === 0) ||
            start > message.memory.byteLength - size)
          throw new HttpError(errno.EFAULT, "HTTP argument is outside Wasm memory");
        spans[name] = [start, start + size];
      }
      if (message.methodSize === 0n || message.urlSize === 0n)
        throw new HttpError(errno.EINVAL, "HTTP method and URL must not be empty");
      const bytes = new Uint8Array(message.memory);
      const text = name => {
        const value = decoder.decode(bytes.slice(...spans[name]));
        if (value.includes("\0")) throw new HttpError(errno.EINVAL, "NUL in HTTP metadata");
        return value;
      };
      this.request({ method: text("method"), url: text("url"), headers: text("headers"),
        body: message.bodySize === 0n ? null : bytes.slice(...spans.body),
        flags: message.flags, sequence });
      return 0;
    } catch (error) {
      return -(error instanceof HttpError ? error.errno : errno.EINVAL);
    }
  }

  request(request) {
    if (this.closed) throw new HttpError(errno.ECANCELED, "HTTP broker closed");
    const index = this.slotIndex(request.sequence);
    if (this.slots[index]) throw new HttpError(errno.EBUSY, "HTTP slot is settling");
    const transfer = new HttpTransfer(this, index, request.sequence);
    this.slots[index] = transfer;
    this.requestCount++;
    transfer.pending = transfer.run(request).finally(() => {
      this.completedRequestCount++;
      this.slots[index] = null;
    });
    return transfer.pending;
  }

  // Whole-runtime teardown only. Process cancellation uses an exact handle.
  close() {
    this.closed = true;
    for (const transfer of this.slots) transfer?.cancel();
  }
}

class HttpTransfer {
  constructor(broker, index, sequence) {
    this.broker = broker;
    this.sequence = sequence;
    this.address = broker.address + index * (NetworkTransport.headerSize + broker.capacity);
    this.word = this.address / 4;
    this.controller = new AbortController();
    this.deadline = Infinity;
    this.terminalError = 0;
    this.reader = null;
    this.controller.signal.addEventListener("abort", () => {
      Atomics.notify(broker.words, this.word);
      void this.reader?.cancel().catch(() => {});
    }, { once: true });
  }

  current() {
    return (Atomics.load(this.broker.words, this.word + NetworkTransport.sequence) >>> 0) === this.sequence;
  }

  check() {
    if (this.terminalError) throw new HttpError(this.terminalError, "HTTP transfer ended");
    if (!this.current()) throw new HttpError(errno.ECANCELED, "HTTP cancelled");
    if (this.controller.signal.aborted || performance.now() >= this.deadline)
      throw new HttpError(errno.ETIMEDOUT, "HTTP deadline exceeded");
  }

  fail(error) {
    // A late provider result must not republish an error Wasm already consumed.
    if (this.terminalError || !this.current()) return;
    this.terminalError = error;
    Atomics.store(this.broker.words, this.word + NetworkTransport.error, error);
    Atomics.store(this.broker.words, this.word, 3);
    Atomics.notify(this.broker.words, this.word);
  }

  cancel() {
    this.fail(errno.ECANCELED);
    this.controller.abort();
    // Keep the host slot until run() settles. Repeated guest cancellations
    // cannot accumulate unlimited providers that ignore AbortSignal.
  }

  async publish(bytes, status, eof, kind) {
    const { words, bytes: memory, capacity } = this.broker;
    for (;;) {
      this.check();
      const state = Atomics.load(words, this.word);
      if (state === 1) break;
      const waiting = Atomics.waitAsync(words, this.word, state, this.deadline - performance.now());
      if (waiting.async) await waiting.value;
    }
    if (bytes.length > capacity) throw new HttpError(errno.E2BIG, "HTTP record exceeds slot capacity");
    memory.set(bytes, this.address + NetworkTransport.headerSize);
    Atomics.store(words, this.word + NetworkTransport.status, status);
    Atomics.store(words, this.word + NetworkTransport.length, bytes.length);
    Atomics.store(words, this.word + NetworkTransport.eof, eof ? 1 : 0);
    Atomics.store(words, this.word + NetworkTransport.error, 0);
    Atomics.store(words, this.word + NetworkTransport.kind, kind);
    Atomics.store(words, this.word, 2);
    Atomics.notify(words, this.word);
  }

  async run({ method, url, headers: headerBlock, body, flags }) {
    let timeout, failure = errno.EINVAL;
    try {
      this.check();
      const target = new URL(url, this.broker.baseURL);
      if (target.protocol !== "http:" && target.protocol !== "https:")
        throw new HttpError(errno.EPROTONOSUPPORT, "HTTP requires HTTP(S)");
      if (target.username !== "" || target.password !== "")
        throw new HttpError(errno.EINVAL, "HTTP requires a credential-free URL");
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method))
        throw new HttpError(errno.EINVAL, "invalid HTTP method");
      const headers = new Headers();
      for (const line of headerBlock.split(/\r?\n/)) {
        if (line === "") continue;
        const colon = line.indexOf(":");
        if (colon <= 0) throw new HttpError(errno.EINVAL, "invalid HTTP request header");
        headers.append(line.slice(0, colon), line.slice(colon + 1));
      }
      stripDollyBrowserOwnedHeaders(headers);
      const upperMethod = method.toUpperCase();
      const rule = this.broker.policy.authorize(target, upperMethod, headers, body?.byteLength ?? 0);
      this.deadline = performance.now() + rule.timeoutMilliseconds;
      timeout = setTimeout(() => {
        this.fail(errno.ETIMEDOUT);
        this.controller.abort();
      }, rule.timeoutMilliseconds);
      failure = errno.EIO;
      const init = {
        method: upperMethod, headers,
        body: body === null || upperMethod === "GET" || upperMethod === "HEAD" ? undefined : body,
        credentials: "omit",
        redirect: (flags & 2) && rule.followRedirects === true ? "follow" : "error",
        referrerPolicy: "no-referrer",
        signal: this.controller.signal,
      };
      let response = await this.broker.fetchRequest(target, init);
      if (rule.bootstrap === true)
        response = await decodeStaticAsset(response, target, init, rule.maxResponseBytes, this.broker.fetchRequest);
      const status = response.status;
      await this.publish(encoder.encode(response.url), status, false, 1);
      await this.publish(encoder.encode(`HTTP/1.1 ${status} ${response.statusText}\r\n`), status, false, 2);
      for (const [name, value] of response.headers) {
        if (!isDollyCredentialHeader(name))
          await this.publish(encoder.encode(`${name}: ${value}\r\n`), status, false, 2);
      }
      await this.publish(encoder.encode("\r\n"), status, false, 2);
      let responseBytes = 0;
      const publishBody = async bytes => {
        responseBytes += bytes.length;
        if (responseBytes > rule.maxResponseBytes)
          throw new HttpError(errno.E2BIG, "HTTP response exceeds its size limit");
        for (let offset = 0; offset < bytes.length; offset += this.broker.capacity)
          await this.publish(bytes.subarray(offset, offset + this.broker.capacity), status, false, 3);
      };
      if (response.body !== null) {
        this.reader = response.body.getReader();
        for (;;) {
          const { done, value } = await this.reader.read();
          if (done) break;
          await publishBody(value);
        }
      }
      await this.publish(new Uint8Array(), status, true, 3);
    } catch (error) {
      this.fail(error instanceof HttpError ? error.errno :
        this.controller.signal.aborted ? errno.ETIMEDOUT : failure);
    } finally {
      clearTimeout(timeout);
      this.controller.abort();
    }
  }
}
