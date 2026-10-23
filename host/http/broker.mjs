import { HttpError, isDollyCredentialHeader, stripDollyBrowserOwnedHeaders } from "./policy.mjs";
import { DOLLY_ERRNO as errno } from "./abi.mjs";
import { decodeStaticAsset, sitePath } from "../../src/static-asset.mjs";
import { DOLLY_HTTP_SLOT_COUNT, DOLLY_HTTP_CHUNK_CAPACITY, DOLLY_HTTP_MAX_METHOD, DOLLY_HTTP_MAX_URL,
  DOLLY_HTTP_MAX_HEADERS, DOLLY_HTTP_MAX_BODY, DOLLY_HTTP_HEADER_SIZE, DOLLY_HTTP_WORD_SEQUENCE,
  DOLLY_HTTP_WORD_STATUS, DOLLY_HTTP_WORD_LENGTH, DOLLY_HTTP_WORD_EOF, DOLLY_HTTP_WORD_ERROR,
  DOLLY_HTTP_WORD_KIND, DOLLY_HTTP_STATE_WRITABLE, DOLLY_HTTP_STATE_READABLE, DOLLY_HTTP_STATE_FAILED,
  DOLLY_HTTP_KIND_URL, DOLLY_HTTP_KIND_HEADER, DOLLY_HTTP_KIND_BODY } from "./abi.mjs";

const encoder = new TextEncoder();
const now = () => performance.timeOrigin + performance.now();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export const DOLLY_HTTP_LIMITS = Object.freeze({ method: DOLLY_HTTP_MAX_METHOD, url: DOLLY_HTTP_MAX_URL,
  headers: DOLLY_HTTP_MAX_HEADERS, body: DOLLY_HTTP_MAX_BODY });

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

// The Worker's end of the mailbox pool: it copies what a request descriptor
// names out of kernel memory and writes the page's records into the slots.
export class HttpMailbox {
  constructor(buffer, address) {
    if (!(buffer instanceof SharedArrayBuffer) || !Number.isSafeInteger(address) ||
        address <= 0 || address % 64 !== 0 ||
        address > buffer.byteLength - DOLLY_HTTP_SLOT_COUNT * (DOLLY_HTTP_HEADER_SIZE + DOLLY_HTTP_CHUNK_CAPACITY)) {
      throw new TypeError("invalid HTTP mailbox pool bounds");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    // The transfer (the page's number for it) that last ended in each slot, and its error.
    this.ended = Array(DOLLY_HTTP_SLOT_COUNT).fill(null);
  }

  word(index) { return (this.address + index * (DOLLY_HTTP_HEADER_SIZE + DOLLY_HTTP_CHUNK_CAPACITY)) / 4; }

  // The page's admission message for a descriptor: a cancellation, a request
  // copied out of `memory`, or the errno it fails with once the page has
  // judged the slot. All spans are checked before any guest byte is decoded.
  admission(memory, message) {
    const sequence = message.sequence >>> 0;
    if (message.method === 0n) {
      return { sequence, cancel: message.methodSize === 0n && message.url === 0n && message.urlSize === 0n &&
        message.headers === 0n && message.headersSize === 0n && message.body === 0n && message.bodySize === 0n &&
        message.flags === 0 };
    }
    try {
      if (!(memory instanceof SharedArrayBuffer) || (message.flags & ~3) !== 0)
        throw new HttpError(errno.EINVAL, "invalid HTTP admission");
      const spans = {};
      for (const [name, maximum] of Object.entries(DOLLY_HTTP_LIMITS)) {
        const start = Number(message[name]), size = Number(message[`${name}Size`]);
        if (!Number.isSafeInteger(size) || size < 0 || size > maximum)
          throw new HttpError(errno.E2BIG, "HTTP argument exceeds its byte limit");
        if (!Number.isSafeInteger(start) || start < 0 || (size !== 0 && start === 0) ||
            start > memory.byteLength - size)
          throw new HttpError(errno.EFAULT, "HTTP argument is outside Wasm memory");
        spans[name] = [start, start + size];
      }
      if (message.methodSize === 0n || message.urlSize === 0n)
        throw new HttpError(errno.EINVAL, "HTTP method and URL must not be empty");
      const bytes = new Uint8Array(memory);
      const text = name => {
        const value = decoder.decode(bytes.slice(...spans[name]));
        if (value.includes("\0")) throw new HttpError(errno.EINVAL, "NUL in HTTP metadata");
        return value;
      };
      return { sequence, request: { method: text("method"), url: text("url"), headers: text("headers"),
        body: message.bodySize === 0n ? null : bytes.slice(...spans.body), flags: message.flags } };
    } catch (error) {
      return { sequence, error: error instanceof HttpError ? error.errno : errno.EINVAL };
    }
  }

  current(word, sequence) {
    return (Atomics.load(this.words, word + DOLLY_HTTP_WORD_SEQUENCE) >>> 0) === sequence;
  }

  // Writes one record once the slot is writable: 0, or the errno that ended
  // the transfer (the guest's cancellation, the page's failure, the deadline,
  // in milliseconds of the epoch: page and Worker count from different origins).
  async publish({ index, transfer, sequence, bytes, status, eof, kind, deadline }) {
    const { words } = this, word = this.word(index);
    for (;;) {
      const ended = this.ended[index];
      if (ended?.transfer === transfer) return ended.error;
      if (!this.current(word, sequence)) return errno.ECANCELED;
      if (now() >= deadline) return errno.ETIMEDOUT;
      const state = Atomics.load(words, word);
      if (state === DOLLY_HTTP_STATE_WRITABLE) break;
      const waiting = Atomics.waitAsync(words, word, state, deadline - now());
      if (waiting.async) await waiting.value;
    }
    if (bytes.length > DOLLY_HTTP_CHUNK_CAPACITY) return errno.E2BIG;
    this.bytes.set(bytes, word * 4 + DOLLY_HTTP_HEADER_SIZE);
    Atomics.store(words, word + DOLLY_HTTP_WORD_STATUS, status);
    Atomics.store(words, word + DOLLY_HTTP_WORD_LENGTH, bytes.length);
    Atomics.store(words, word + DOLLY_HTTP_WORD_EOF, eof ? 1 : 0);
    Atomics.store(words, word + DOLLY_HTTP_WORD_ERROR, 0);
    Atomics.store(words, word + DOLLY_HTTP_WORD_KIND, kind);
    Atomics.store(words, word, DOLLY_HTTP_STATE_READABLE);
    Atomics.notify(words, word);
    return 0;
  }

  // A transfer's end, once: a late result must not republish an error Wasm
  // already consumed, nor reach a slot the guest has reused.
  fail({ index, transfer, sequence, error }) {
    const word = this.word(index);
    if (this.ended[index]?.transfer === transfer || !this.current(word, sequence)) return;
    this.ended[index] = { transfer, error };
    Atomics.store(this.words, word + DOLLY_HTTP_WORD_ERROR, error);
    Atomics.store(this.words, word, DOLLY_HTTP_STATE_FAILED);
    Atomics.notify(this.words, word);
  }
}

// The page's broker: policy, Fetch and the slots' bookkeeping. It never reads
// kernel memory: `mailbox` (HttpMailbox, or messages to it) writes the slots.
export class NetworkTransport {
  // `site` is the URL of the root of the site serving this release, if any.
  constructor(mailbox, policy, { fetchRequest = globalThis.fetch.bind(globalThis), site } = {}) {
    this.mailbox = mailbox;
    this.capacity = DOLLY_HTTP_CHUNK_CAPACITY;
    this.policy = policy;
    this.fetchRequest = fetchRequest;
    this.site = site;
    // Host bookkeeping, never derived from a guest's claimed active count.
    this.slots = Array(DOLLY_HTTP_SLOT_COUNT).fill(null);
    this.closed = false;
    this.requestCount = 0;
    this.completedRequestCount = 0;
  }

  get active() { return this.slots.some(slot => slot !== null); }

  // A URL is absolute, or a site path: /vVERSION/FILE is a file of the site
  // serving this release, never above its root and of no other version. The
  // policy then judges it like any other URL.
  target(url) {
    const absolute = URL.parse(url);
    if (absolute || !url.startsWith("/")) return absolute;
    const file = URL.parse(sitePath(url).slice(1), this.site);
    return file?.href.startsWith(this.site) ? file : null;
  }

  slotIndex(sequence) {
    if (!Number.isInteger(sequence) || sequence <= 0 || sequence > 0xffffffff)
      throw new HttpError(errno.EINVAL, "invalid HTTP handle");
    return (sequence - 1) % DOLLY_HTTP_SLOT_COUNT;
  }

  // An admission message (HttpMailbox.admission): 0 or a negative errno.
  async dispatch({ sequence, cancel, request, error }) {
    try {
      if (this.closed) return -errno.ECANCELED;
      const index = this.slotIndex(sequence);
      if (cancel !== undefined) {
        if (!cancel) throw new HttpError(errno.EINVAL, "invalid HTTP cancellation");
        const transfer = this.slots[index];
        if (transfer && transfer.sequence !== sequence) return -errno.ESTALE;
        transfer?.cancel();
        return 0;
      }
      if (this.slots[index]) return -errno.EBUSY;
      if (error) return -error;
      this.request({ ...request, sequence });
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
    transfer.id = ++this.requestCount;
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
    this.index = index;
    this.sequence = sequence;
    this.controller = new AbortController();
    this.deadline = Infinity;
    this.terminalError = 0;
    this.reader = null;
    this.controller.signal.addEventListener("abort", () => {
      void this.reader?.cancel().catch(() => {});
    }, { once: true });
  }

  check() {
    if (this.terminalError) throw new HttpError(this.terminalError, "HTTP transfer ended");
    if (this.controller.signal.aborted || performance.now() >= this.deadline)
      throw new HttpError(errno.ETIMEDOUT, "HTTP deadline exceeded");
  }

  // The mailbox ends the slot's transfer once, and only while the guest's
  // slot still holds this sequence; a waiting record then gives up.
  fail(error) {
    if (this.terminalError) return;
    this.terminalError = error;
    this.broker.mailbox.fail({ index: this.index, transfer: this.id, sequence: this.sequence, error });
  }

  cancel() {
    this.fail(errno.ECANCELED);
    this.controller.abort();
    // Keep the host slot until run() settles. Repeated guest cancellations
    // cannot accumulate unlimited providers that ignore AbortSignal.
  }

  async publish(bytes, status, eof, kind) {
    this.check();
    if (bytes.length > this.broker.capacity) throw new HttpError(errno.E2BIG, "HTTP record exceeds slot capacity");
    const error = await this.broker.mailbox.publish({ index: this.index, transfer: this.id, sequence: this.sequence,
      bytes: bytes.slice(), status, eof, kind, deadline: now() + this.deadline - performance.now() });
    if (error) throw new HttpError(error, "HTTP transfer ended");
  }

  async run({ method, url, headers: headerBlock, body, flags }) {
    let timeout, failure = errno.EINVAL;
    try {
      this.check();
      const target = this.broker.target(url);
      if (target === null) throw new HttpError(errno.EINVAL, "HTTP requires an absolute URL or a site path");
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
      const source = rule.bootstrap === true ? new URL(rule.mirror) : rule.relay ? new URL(rule.relay) : target;
      let response = await this.broker.fetchRequest(source, init);
      if (rule.bootstrap === true)
        response = await decodeStaticAsset(response, source, init, rule.maxResponseBytes, this.broker.fetchRequest);
      const status = response.status;
      // A relay is transport, and where the site is served is the page's
      // business: the program is told the URL it asked for.
      await this.publish(encoder.encode(rule.relay ? target.href : url.startsWith("/") ? url : response.url),
        status, false, DOLLY_HTTP_KIND_URL);
      await this.publish(encoder.encode(`HTTP/1.1 ${status} ${response.statusText}\r\n`), status, false, DOLLY_HTTP_KIND_HEADER);
      for (const [name, value] of response.headers) {
        if (!isDollyCredentialHeader(name))
          await this.publish(encoder.encode(`${name}: ${value}\r\n`), status, false, DOLLY_HTTP_KIND_HEADER);
      }
      await this.publish(encoder.encode("\r\n"), status, false, DOLLY_HTTP_KIND_HEADER);
      let responseBytes = 0;
      const publishBody = async bytes => {
        if (bytes.length > Number.MAX_SAFE_INTEGER - responseBytes)
          throw new HttpError(errno.E2BIG, "HTTP response byte counter overflow");
        responseBytes += bytes.length;
        if (responseBytes > rule.maxResponseBytes)
          throw new HttpError(errno.E2BIG, "HTTP response exceeds its size limit");
        for (let offset = 0; offset < bytes.length; offset += this.broker.capacity)
          await this.publish(bytes.subarray(offset, offset + this.broker.capacity), status, false, DOLLY_HTTP_KIND_BODY);
      };
      if (response.body !== null) {
        this.reader = response.body.getReader();
        for (;;) {
          const { done, value } = await this.reader.read();
          if (done) break;
          await publishBody(value);
        }
      }
      await this.publish(new Uint8Array(), status, true, DOLLY_HTTP_KIND_BODY);
    } catch (error) {
      this.fail(error instanceof HttpError ? error.errno :
        this.controller.signal.aborted ? errno.ETIMEDOUT : failure);
    } finally {
      clearTimeout(timeout);
      this.controller.abort();
    }
  }
}
