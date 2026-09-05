import { isDollyCredentialHeader, stripDollyBrowserOwnedHeaders } from "./http-policy.mjs";

const encoder = new TextEncoder();
export const DOLLY_HTTP_MAILBOX_VERSION = 3;

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
    fetchRequest = globalThis.fetch,
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
        throw new DOMException("HTTP deadline exceeded", "TimeoutError");
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
    if (bytes.length > this.capacity) throw new Error("HTTP chunk exceeds mailbox capacity");
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
    try {
      const observedSequence = Atomics.load(
        this.words,
        this.word + NetworkTransport.sequence,
      ) >>> 0;
      if (observedSequence !== sequence) {
        throw new Error(
          `HTTP mailbox sequence mismatch (runtime ${sequence}, browser ${observedSequence})`,
        );
      }
      const target = new URL(url, this.baseURL);
      if ((target.protocol !== "http:" && target.protocol !== "https:") ||
          target.username !== "" || target.password !== "") {
        throw new TypeError("HTTP requires a credential-free HTTP(S) URL");
      }
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)) {
        throw new Error("invalid HTTP method");
      }
      const headers = new Headers();
      for (const line of headerBlock.split(/\r?\n/)) {
        if (line === "") continue;
        const colon = line.indexOf(":");
        if (colon <= 0) throw new Error("invalid HTTP request header");
        headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      }
      stripDollyBrowserOwnedHeaders(headers);
      const upperMethod = method.toUpperCase();
      const requestBytes = body?.byteLength ?? 0;
      const rule = this.policy.authorize(target, upperMethod, headers, requestBytes);
      controller = new AbortController();
      this.controller = controller;
      this.deadline = performance.now() + rule.timeoutMilliseconds;
      timeout = setTimeout(() => controller.abort(), rule.timeoutMilliseconds);
      const response = await this.fetchRequest(target, {
        method: upperMethod,
        headers,
        body: body === null || upperMethod === "GET" || upperMethod === "HEAD"
          ? undefined
          : body,
        credentials: "omit",
        redirect: "error",
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
          throw new Error("Dolly HTTP response exceeds its size limit");
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
    Atomics.store(this.words, this.word + NetworkTransport.state, 0);
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
