import { HttpError, isDollyCredentialHeader, stripDollyBrowserOwnedHeaders } from "./http-policy.mjs";
import { DOLLY_ERRNO as errno } from "../dist/dolly-errno.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export const DOLLY_HTTP_MAILBOX_VERSION = 4;
export const DOLLY_HTTP_LIMITS = Object.freeze({ method: 32, url: 8192, headers: 65536, body: 8 * 1024 * 1024 });

// This acknowledgement is browser bookkeeping, NOT guest memory. Blocking
// only admission bounds the message queue while Fetch/body streaming remains
// asynchronous on the page. The import returns after the request is copied.
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
        address <= 0 || address % 4 !== 0 || capacity !== 65536 ||
        address > buffer.byteLength - NetworkTransport.headerSize - capacity) {
      throw new TypeError("invalid HTTP mailbox bounds");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.word = address / 4;
    this.capacity = capacity;
    this.policy = policy;
    this.fetchRequest = fetchRequest;
    this.baseURL = baseURL;
    this.deadline = Infinity;
    this.active = false;
    this.activeToken = 0;
    this.activeSequence = 0;
    this.nextToken = 0;
    this.controller = null;
    this.requestCount = 0;
    this.completedRequestCount = 0;
    this.pending = null;
  }

  // Called once per synchronous import admission. No guest bytes are decoded
  // or copied until ALL spans pass the fixed bounds. The shared memory is the
  // actual kernel memory supplied by the trusted import, not a guest JS object.
  async dispatch(message) {
    try {
      const sequence = message.sequence >>> 0;
      if (sequence === 0) throw new HttpError(errno.EINVAL, "invalid HTTP sequence");
      if (message.method === 0n) {
        if (message.methodSize !== 0n || message.url !== 0n || message.urlSize !== 0n ||
            message.headers !== 0n || message.headersSize !== 0n ||
            message.body !== 0n || message.bodySize !== 0n || message.flags !== 0) {
          throw new HttpError(errno.EINVAL, "invalid HTTP cancellation");
        }
        this.cancelBefore(sequence);
        await this.pending;
        return 0;
      }
      if (this.pending || this.activeToken) return -errno.EBUSY;
      if (!(message.memory instanceof SharedArrayBuffer) || (message.flags & ~3) !== 0) {
        throw new HttpError(errno.EINVAL, "invalid HTTP admission");
      }
      const spans = {};
      for (const [name, maximum] of Object.entries(DOLLY_HTTP_LIMITS)) {
        const start = Number(message[name]), size = Number(message[`${name}Size`]);
        if (!Number.isSafeInteger(size) || size < 0 || size > maximum) {
          throw new HttpError(errno.E2BIG, "HTTP argument exceeds its byte limit");
        }
        if (!Number.isSafeInteger(start) || start < 0 || (size !== 0 && start === 0) ||
            start > message.memory.byteLength - size) {
          throw new HttpError(errno.EFAULT, "HTTP argument is outside Wasm memory");
        }
        spans[name] = [start, start + size];
      }
      if (message.methodSize === 0n || message.urlSize === 0n) {
        throw new HttpError(errno.EINVAL, "HTTP method and URL must not be empty");
      }
      const bytes = new Uint8Array(message.memory);
      const text = name => {
        const value = decoder.decode(bytes.slice(...spans[name]));
        if (value.includes("\0")) throw new HttpError(errno.EINVAL, "NUL in HTTP metadata");
        return value;
      };
      const request = { method: text("method"), url: text("url"), headers: text("headers"),
        body: message.bodySize === 0n ? null : bytes.slice(...spans.body),
        flags: message.flags, sequence };
      this.pending = this.request(request).finally(() => { this.pending = null; });
      return 0;
    } catch (error) {
      return -(error instanceof HttpError ? error.errno : errno.EINVAL);
    }
  }

  async waitForWritable(token, sequence) {
    const index = this.word + NetworkTransport.state;
    for (;;) {
      if (this.activeToken !== token ||
          (Atomics.load(this.words, this.word + NetworkTransport.sequence) >>> 0) !== sequence) {
        throw new DOMException("HTTP request interrupted", "AbortError");
      }
      const current = Atomics.load(this.words, index);
      const remaining = this.deadline - performance.now();
      if (this.controller?.signal.aborted || remaining <= 0) {
        throw new HttpError(errno.ETIMEDOUT, "HTTP deadline exceeded");
      }
      if (current === 1) return;
      const waiting = Atomics.waitAsync(this.words, index, current, remaining);
      if (waiting.async) await waiting.value;
    }
  }

  async publish(token, sequence, bytes, status, eof, error, kind) {
    await this.waitForWritable(token, sequence);
    // An interrupt can run while the resolved wait queues this continuation.
    if (this.activeToken !== token ||
        (Atomics.load(this.words, this.word + NetworkTransport.sequence) >>> 0) !== sequence) {
      throw new DOMException("HTTP request interrupted", "AbortError");
    }
    if (bytes.length > this.capacity) throw new HttpError(errno.E2BIG, "HTTP chunk exceeds mailbox capacity");
    this.bytes.set(bytes, this.address + NetworkTransport.headerSize);
    Atomics.store(this.words, this.word + NetworkTransport.status, status);
    Atomics.store(this.words, this.word + NetworkTransport.length, bytes.length);
    Atomics.store(this.words, this.word + NetworkTransport.eof, eof ? 1 : 0);
    Atomics.store(this.words, this.word + NetworkTransport.error, error);
    Atomics.store(this.words, this.word + NetworkTransport.kind, kind);
    Atomics.store(this.words, this.word + NetworkTransport.state, 2);
    Atomics.notify(this.words, this.word + NetworkTransport.state);
  }

  async request({ method, url, headers: headerBlock, body, flags, sequence }) {
    if (this.activeToken !== 0) throw new Error("concurrent HTTP requests are not supported");
    const token = ++this.nextToken;
    this.activeToken = token;
    this.activeSequence = sequence;
    this.active = true;
    this.requestCount += 1;
    let status = 0;
    let timeout;
    let controller;
    let failure = errno.EINVAL;
    try {
      const observedSequence = Atomics.load(
        this.words,
        this.word + NetworkTransport.sequence,
      ) >>> 0;
      if (observedSequence !== sequence) {
        throw new HttpError(errno.EINVAL, "HTTP mailbox sequence mismatch");
      }
      const target = new URL(url, this.baseURL);
      if (target.protocol !== "http:" && target.protocol !== "https:")
        throw new HttpError(errno.EPROTONOSUPPORT, "HTTP requires HTTP(S)");
      if (target.username !== "" || target.password !== "")
        throw new HttpError(errno.EINVAL, "HTTP requires a credential-free URL");
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)) {
        throw new HttpError(errno.EINVAL, "invalid HTTP method");
      }
      const headers = new Headers();
      for (const line of headerBlock.split(/\r?\n/)) {
        if (line === "") continue;
        const colon = line.indexOf(":");
        if (colon <= 0) throw new HttpError(errno.EINVAL, "invalid HTTP request header");
        headers.append(line.slice(0, colon), line.slice(colon + 1));
      }
      stripDollyBrowserOwnedHeaders(headers);
      const upperMethod = method.toUpperCase();
      const requestBytes = body?.byteLength ?? 0;
      const rule = this.policy.authorize(target, upperMethod, headers, requestBytes);
      controller = new AbortController();
      this.controller = controller;
      this.deadline = performance.now() + rule.timeoutMilliseconds;
      timeout = setTimeout(() => controller.abort(), rule.timeoutMilliseconds);
      failure = errno.EIO;
      const response = await this.fetchRequest(target, {
        method: upperMethod,
        headers,
        body: body === null || upperMethod === "GET" || upperMethod === "HEAD"
          ? undefined
          : body,
        credentials: "omit",
        // Restricted rules cannot authorize the browser's hidden redirect hops.
        redirect: (flags & 2) && rule.followRedirects === true ? "follow" : "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      status = response.status;
      await this.publish(token, sequence, encoder.encode(response.url), status, false, 0, 1);
      await this.publish(
        token, sequence,
        encoder.encode(`HTTP/1.1 ${status} ${response.statusText}\r\n`),
        status,
        false,
        0,
        2,
      );
      for (const [name, value] of response.headers) {
        if (isDollyCredentialHeader(name)) continue;
        await this.publish(
          token, sequence, encoder.encode(`${name}: ${value}\r\n`),
          status, false, 0, 2,
        );
      }
      await this.publish(token, sequence, encoder.encode("\r\n"), status, false, 0, 2);
      let responseBytes = 0;
      const publishBody = async (bytes) => {
        responseBytes += bytes.length;
        if (responseBytes > rule.maxResponseBytes) {
          throw new HttpError(errno.E2BIG, "Dolly HTTP response exceeds its size limit");
        }
        for (let offset = 0; offset < bytes.length; offset += this.capacity) {
          await this.publish(
            token, sequence, bytes.subarray(offset, offset + this.capacity),
            status, false, 0, 3,
          );
        }
      };
      if (response.body === null) {
        const body = new Uint8Array(await response.arrayBuffer());
        await publishBody(body);
      } else {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await publishBody(value);
        }
      }
      await this.publish(token, sequence, new Uint8Array(), status, true, 0, 3);
    } catch (error) {
      const requestIsCurrent = this.activeToken === token &&
        (Atomics.load(this.words, this.word + NetworkTransport.sequence) >>> 0) === sequence;
      // Policy denials, quota failures, fetch errors, and command teardown are
      // request results delivered through the typed mailbox. Only failures in
      // the outer request chain populate the browser diagnostic dataset.
      if (requestIsCurrent) {
        // State 3 is a terminal failure, independent of guest consumption.
        // Do not overwrite a chunk the guest may currently be copying. Its
        // acknowledgement uses compare-exchange and cannot erase this state.
        const reason = error instanceof HttpError ? error.errno :
          controller?.signal.aborted ? errno.ETIMEDOUT : failure;
        Atomics.store(this.words, this.word + NetworkTransport.error, reason);
        Atomics.store(this.words, this.word + NetworkTransport.state, 3);
        Atomics.notify(this.words, this.word + NetworkTransport.state);
      }
    } finally {
      clearTimeout(timeout);
      controller?.abort();
      this.completedRequestCount += 1;
      if (this.activeToken === token) {
        this.activeToken = 0;
        this.activeSequence = 0;
        this.controller = null;
        this.deadline = Infinity;
        this.active = false;
      }
    }
  }

  interrupt() {
    if (this.activeToken === 0) return;
    this.activeToken = 0;
    this.activeSequence = 0;
    this.active = false;
    this.controller?.abort();
    this.controller = null;
    Atomics.store(this.words, this.word + NetworkTransport.error, errno.ECANCELED);
    Atomics.store(this.words, this.word + NetworkTransport.state, 3);
    Atomics.notify(this.words, this.word + NetworkTransport.state);
  }

  cancelBefore(sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffff_ffff) {
      throw new Error("invalid HTTP cancellation sequence");
    }
    if (this.activeToken === 0 || this.activeSequence === sequence) return;
    this.activeToken = 0;
    this.activeSequence = 0;
    this.active = false;
    this.controller?.abort();
    this.controller = null;
    Atomics.notify(this.words, this.word + NetworkTransport.state);
  }
}
