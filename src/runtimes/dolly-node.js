// Dolly's deliberately small Node-shaped JavaScript environment. This file is
// evaluated inside QuickJS. Its only native authority is the in-Wasm `Dolly`
// object installed by quickjs-main.c; it never reaches browser JavaScript.

console.warn ??= console.error;
console.info ??= console.log;
console.debug ??= console.log;

const envTarget = Object.create(null);
const env = new Proxy(envTarget, {
  get(_target, property) {
    if (typeof property !== "string") return undefined;
    return Dolly.getenv(property);
  },
  set(_target, property, value) {
    if (typeof property !== "string") return false;
    Dolly.setenv(property, String(value));
    return true;
  },
  deleteProperty(_target, property) {
    if (typeof property !== "string") return false;
    Dolly.setenv(property, undefined);
    return true;
  },
});

const stdout = {
  get isTTY() { return Boolean(Dolly.isatty(1)); },
  columns: 100,
  rows: 30,
  writableLength: 0,
  write(value) {
    return Boolean(Dolly.stdout(String(value)));
  },
  on() { return this; },
  once(_event, listener) {
    if (typeof listener === "function") queueMicrotask(listener);
    return this;
  },
};

const stderr = {
  ...stdout,
  get isTTY() { return Boolean(Dolly.isatty(2)); },
  write(value) {
    return Boolean(Dolly.stderr(String(value)));
  },
};

const stdin = {
  get isTTY() { return Boolean(Dolly.isatty(0)); },
  readable: true,
  setEncoding() { return this; },
  setRawMode() { return this; },
  resume() { return this; },
  pause() { return this; },
  on() { return this; },
  once() { return this; },
};

globalThis.process = {
  argv: [
    globalThis.scriptExecutable ?? "qjs",
    ...(globalThis.scriptPath ? [globalThis.scriptPath] : []),
    ...(globalThis.scriptArgs ?? []),
  ],
  env,
  platform: "wasm",
  arch: "wasm64",
  version: "v22.19.0-dolly",
  versions: { dolly: "0" },
  release: { name: "dolly" },
  pid: 1,
  ppid: 0,
  title: "qjs",
  stdin,
  stdout,
  stderr,
  exitCode: 0,
  cwd: () => Dolly.cwd(),
  chdir: (path) => Dolly.chdir(String(path)),
  nextTick: (callback, ...args) => queueMicrotask(() => callback(...args)),
  emitWarning() {},
  on() { return this; },
  once() { return this; },
  off() { return this; },
  removeListener() { return this; },
  getBuiltinModule() { return undefined; },
};

if (typeof globalThis.queueMicrotask !== "function") {
  globalThis.queueMicrotask = (callback) => Promise.resolve().then(callback);
}

let nextTimerId = 1;
const timers = new Map();
globalThis.setTimeout = (callback, _delay = 0, ...args) => {
  const id = nextTimerId++;
  timers.set(id, { callback, args, repeat: false });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.setInterval = (callback, _delay = 0, ...args) => {
  const id = nextTimerId++;
  timers.set(id, { callback, args, repeat: true });
  return id;
};
globalThis.clearInterval = globalThis.clearTimeout;

class DollyAbortSignal {
  aborted = false;
  reason = undefined;
  #listeners = new Set();

  addEventListener(type, listener) {
    if (type === "abort") this.#listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === "abort") this.#listeners.delete(listener);
  }

  throwIfAborted() {
    if (this.aborted) throw this.reason ?? new Error("This operation was aborted");
  }

  _abort(reason) {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason ?? new Error("This operation was aborted");
    for (const listener of this.#listeners) listener.call(this, { type: "abort" });
    this.#listeners.clear();
  }

  static abort(reason) {
    const signal = new DollyAbortSignal();
    signal._abort(reason);
    return signal;
  }

  static timeout(_milliseconds) {
    // Dolly's HTTP broker owns request timeout policy. Version 0 deliberately
    // does not create an asynchronous host timer for this compatibility shape.
    return new DollyAbortSignal();
  }

  static any(signals) {
    const controller = new DollyAbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener("abort", () => controller.abort(signal.reason));
    }
    return controller.signal;
  }
}

class DollyAbortController {
  signal = new DollyAbortSignal();
  abort(reason) { this.signal._abort(reason); }
}

globalThis.AbortSignal = DollyAbortSignal;
globalThis.AbortController = DollyAbortController;

globalThis.TextEncoder = class TextEncoder {
  get encoding() { return "utf-8"; }
  encode(value = "") { return Dolly.encode(String(value)); }
};

globalThis.TextDecoder = class TextDecoder {
  constructor(label = "utf-8") {
    if (!/^utf-?8$/i.test(label)) throw new RangeError("Dolly supports only UTF-8");
  }
  get encoding() { return "utf-8"; }
  decode(value = new Uint8Array()) {
    if (value instanceof ArrayBuffer) value = new Uint8Array(value);
    return Dolly.decode(value);
  }
};

function bytesToBinary(bytes) {
  let result = "";
  for (let index = 0; index < bytes.length; index++) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
globalThis.btoa = (value) => {
  const input = String(value);
  let output = "";
  for (let index = 0; index < input.length; index += 3) {
    const a = input.charCodeAt(index) & 255;
    const hasB = index + 1 < input.length;
    const hasC = index + 2 < input.length;
    const b = hasB ? input.charCodeAt(index + 1) & 255 : 0;
    const c = hasC ? input.charCodeAt(index + 2) & 255 : 0;
    output += base64Alphabet[a >> 2];
    output += base64Alphabet[((a & 3) << 4) | (b >> 4)];
    output += hasB ? base64Alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    output += hasC ? base64Alphabet[c & 63] : "=";
  }
  return output;
};

globalThis.atob = (value) => {
  let input = String(value).replace(/\s/g, "");
  if (input.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(input) ||
      /=/.test(input.slice(0, -2))) {
    const error = new Error("The string to be decoded is not correctly encoded.");
    error.name = "InvalidCharacterError";
    throw error;
  }
  input += "=".repeat((4 - input.length % 4) % 4);
  let output = "";
  for (let index = 0; index < input.length; index += 4) {
    const a = base64Alphabet.indexOf(input[index]);
    const b = base64Alphabet.indexOf(input[index + 1]);
    const c = input[index + 2] === "=" ? 0 : base64Alphabet.indexOf(input[index + 2]);
    const d = input[index + 3] === "=" ? 0 : base64Alphabet.indexOf(input[index + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0 ||
        input[index + 2] === "=" && input[index + 3] !== "=") {
      const error = new Error("The string to be decoded is not correctly encoded.");
      error.name = "InvalidCharacterError";
      throw error;
    }
    output += String.fromCharCode((a << 2) | (b >> 4));
    if (input[index + 2] !== "=") output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (input[index + 3] !== "=") output += String.fromCharCode(((c & 3) << 6) | d);
  }
  return output;
};

class DollyBuffer extends Uint8Array {
  static from(value, encoding = "utf8") {
    if (typeof value === "string") {
      if (encoding === "base64") {
        const binary = atob(value);
        return new DollyBuffer([...binary].map((character) => character.charCodeAt(0)));
      }
      if (encoding === "hex") {
        const bytes = [];
        for (let index = 0; index + 1 < value.length; index += 2) {
          bytes.push(Number.parseInt(value.slice(index, index + 2), 16));
        }
        return new DollyBuffer(bytes);
      }
      return new DollyBuffer(Dolly.encode(value));
    }
    if (value instanceof ArrayBuffer) return new DollyBuffer(value);
    return new DollyBuffer(value);
  }
  static alloc(size, fill = 0) {
    const result = new DollyBuffer(size);
    result.fill(fill);
    return result;
  }
  static allocUnsafe(size) { return new DollyBuffer(size); }
  static isBuffer(value) { return value instanceof DollyBuffer; }
  static byteLength(value) { return Dolly.encode(String(value)).length; }
  static concat(values, length) {
    const size = length ?? values.reduce((sum, value) => sum + value.length, 0);
    const result = new DollyBuffer(size);
    let offset = 0;
    for (const value of values) {
      const count = Math.min(value.length, size - offset);
      result.set(value.subarray(0, count), offset);
      offset += count;
      if (offset >= size) break;
    }
    return result;
  }
  toString(encoding = "utf8", start = 0, end = this.length) {
    const bytes = this.subarray(start, end);
    if (encoding === "base64") return btoa(bytesToBinary(bytes));
    if (encoding === "hex") return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return Dolly.decode(bytes);
  }
}

globalThis.Buffer = DollyBuffer;

function randomUUID() {
  const bytes = Dolly.random(16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

globalThis.crypto = {
  getRandomValues(array) {
    const bytes = Dolly.random(array.byteLength);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  },
  randomUUID,
};

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch {
    return String(value);
  }
}

function encodeUrlComponent(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

class DollyURLSearchParams {
  #entries = [];
  #onChange;

  constructor(init = "", onChange = undefined) {
    this.#onChange = onChange;
    if (typeof init === "string") {
      const query = init.startsWith("?") ? init.slice(1) : init;
      for (const field of query.split("&")) {
        if (!field) continue;
        const equals = field.indexOf("=");
        const name = equals < 0 ? field : field.slice(0, equals);
        const value = equals < 0 ? "" : field.slice(equals + 1);
        this.#entries.push([decodeUrlComponent(name), decodeUrlComponent(value)]);
      }
    } else if (init instanceof DollyURLSearchParams || init?.[Symbol.iterator]) {
      for (const pair of init) this.#entries.push([String(pair[0]), String(pair[1])]);
    } else if (init) {
      for (const [name, value] of Object.entries(init)) {
        this.#entries.push([String(name), String(value)]);
      }
    }
  }

  #changed() { this.#onChange?.(this.toString()); }
  append(name, value) { this.#entries.push([String(name), String(value)]); this.#changed(); }
  delete(name, value = undefined) {
    name = String(name);
    this.#entries = this.#entries.filter(([entryName, entryValue]) =>
      entryName !== name || (value !== undefined && entryValue !== String(value)));
    this.#changed();
  }
  get(name) { return this.#entries.find(([entryName]) => entryName === String(name))?.[1] ?? null; }
  getAll(name) { return this.#entries.filter(([entryName]) => entryName === String(name)).map(([, value]) => value); }
  has(name, value = undefined) {
    return this.#entries.some(([entryName, entryValue]) =>
      entryName === String(name) && (value === undefined || entryValue === String(value)));
  }
  set(name, value) {
    name = String(name);
    value = String(value);
    const first = this.#entries.findIndex(([entryName]) => entryName === name);
    this.#entries = this.#entries.filter(([entryName]) => entryName !== name);
    this.#entries.splice(first < 0 ? this.#entries.length : first, 0, [name, value]);
    this.#changed();
  }
  sort() { this.#entries.sort(([a], [b]) => a.localeCompare(b)); this.#changed(); }
  entries() { return this.#entries[Symbol.iterator](); }
  keys() { return this.#entries.map(([name]) => name)[Symbol.iterator](); }
  values() { return this.#entries.map(([, value]) => value)[Symbol.iterator](); }
  forEach(callback, thisArg) {
    for (const [name, value] of this.#entries) callback.call(thisArg, value, name, this);
  }
  toString() {
    return this.#entries.map(([name, value]) =>
      `${encodeUrlComponent(name)}=${encodeUrlComponent(value)}`).join("&");
  }
  [Symbol.iterator]() { return this.entries(); }
}

function normalizeUrlPath(path) {
  const absolute = path.startsWith("/");
  const trailingSlash = path.endsWith("/");
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  let result = `${absolute ? "/" : ""}${parts.join("/")}`;
  if (trailingSlash && result !== "/") result += "/";
  return result || (absolute ? "/" : "");
}

class DollyURL {
  #protocol = "";
  #username = "";
  #password = "";
  #hostname = "";
  #port = "";
  #pathname = "";
  #search = "";
  #hash = "";
  #hasAuthority = false;

  constructor(input, base = undefined) {
    let value = String(input);
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
      if (base === undefined) throw new TypeError(`Invalid URL: ${value}`);
      const parent = base instanceof DollyURL ? base : new DollyURL(base);
      if (value.startsWith("//")) {
        value = `${parent.protocol}${value}`;
      } else if (value.startsWith("#")) {
        value = `${parent.href.split("#")[0]}${value}`;
      } else if (value.startsWith("?")) {
        value = `${parent.origin}${parent.pathname}${value}`;
      } else {
        const suffix = value.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
        const relativePath = suffix?.[1] ?? "";
        const path = relativePath.startsWith("/")
          ? relativePath
          : `${parent.pathname.slice(0, parent.pathname.lastIndexOf("/") + 1)}${relativePath}`;
        value = `${parent.origin}${normalizeUrlPath(path)}${suffix?.[2] ?? ""}${suffix?.[3] ?? ""}`;
      }
    }

    const match = value.match(/^([A-Za-z][A-Za-z0-9+.-]*:)(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/);
    if (!match) throw new TypeError(`Invalid URL: ${value}`);
    this.#protocol = match[1].toLowerCase();
    this.#hasAuthority = match[2] !== undefined;
    this.#pathname = normalizeUrlPath(match[3] || (this.#hasAuthority ? "/" : ""));
    this.#search = match[4] ?? "";
    this.#hash = match[5] ?? "";

    let authority = match[2] ?? "";
    const at = authority.lastIndexOf("@");
    if (at >= 0) {
      const userInfo = authority.slice(0, at);
      authority = authority.slice(at + 1);
      const colon = userInfo.indexOf(":");
      this.#username = decodeURIComponent(colon < 0 ? userInfo : userInfo.slice(0, colon));
      this.#password = decodeURIComponent(colon < 0 ? "" : userInfo.slice(colon + 1));
    }
    if (authority.startsWith("[")) {
      const bracket = authority.indexOf("]");
      if (bracket < 0) throw new TypeError(`Invalid URL: ${value}`);
      this.#hostname = authority.slice(0, bracket + 1).toLowerCase();
      this.#port = authority[bracket + 1] === ":" ? authority.slice(bracket + 2) : "";
    } else {
      const colon = authority.lastIndexOf(":");
      this.#hostname = (colon >= 0 ? authority.slice(0, colon) : authority).toLowerCase();
      this.#port = colon >= 0 ? authority.slice(colon + 1) : "";
    }
  }

  static canParse(input, base = undefined) {
    try { new DollyURL(input, base); return true; } catch { return false; }
  }
  static parse(input, base = undefined) {
    try { return new DollyURL(input, base); } catch { return null; }
  }
  get protocol() { return this.#protocol; }
  set protocol(value) { this.#protocol = `${String(value).replace(/:$/, "")}:`.toLowerCase(); }
  get username() { return this.#username; }
  set username(value) { this.#username = String(value); }
  get password() { return this.#password; }
  set password(value) { this.#password = String(value); }
  get hostname() { return this.#hostname; }
  set hostname(value) { this.#hostname = String(value).toLowerCase(); }
  get port() { return this.#port; }
  set port(value) { this.#port = String(value); }
  get host() { return `${this.#hostname}${this.#port ? `:${this.#port}` : ""}`; }
  set host(value) {
    const parsed = new DollyURL(`${this.#protocol}//${String(value)}/`);
    this.#hostname = parsed.hostname;
    this.#port = parsed.port;
  }
  get pathname() { return this.#pathname; }
  set pathname(value) { this.#pathname = normalizeUrlPath(String(value)); }
  get search() { return this.#search; }
  set search(value) {
    value = String(value);
    this.#search = !value ? "" : (value.startsWith("?") ? value : `?${value}`);
  }
  get searchParams() {
    return new DollyURLSearchParams(this.#search, (value) => { this.#search = value ? `?${value}` : ""; });
  }
  get hash() { return this.#hash; }
  set hash(value) {
    value = String(value);
    this.#hash = !value ? "" : (value.startsWith("#") ? value : `#${value}`);
  }
  get origin() {
    return this.#hasAuthority ? `${this.#protocol}//${this.host}` : "null";
  }
  get href() {
    const userInfo = this.#username
      ? `${encodeURIComponent(this.#username)}${this.#password ? `:${encodeURIComponent(this.#password)}` : ""}@`
      : "";
    const authority = this.#hasAuthority ? `//${userInfo}${this.host}` : "";
    return `${this.#protocol}${authority}${this.#pathname}${this.#search}${this.#hash}`;
  }
  set href(value) {
    const parsed = new DollyURL(value);
    this.#protocol = parsed.#protocol;
    this.#username = parsed.#username;
    this.#password = parsed.#password;
    this.#hostname = parsed.#hostname;
    this.#port = parsed.#port;
    this.#pathname = parsed.#pathname;
    this.#search = parsed.#search;
    this.#hash = parsed.#hash;
    this.#hasAuthority = parsed.#hasAuthority;
  }
  toString() { return this.href; }
  toJSON() { return this.href; }
}

globalThis.URLSearchParams = DollyURLSearchParams;
globalThis.URL = DollyURL;

// The OpenAI-compatible client checks for FormData even for ordinary JSON
// requests. Dolly does not expose multipart uploads yet, but defining the
// nominal type keeps that feature test side-effect free.
globalThis.FormData = class DollyFormData {};

class DollyHeaders {
  #values = new Map();
  constructor(init = undefined) {
    if (init instanceof DollyHeaders) {
      for (const [name, value] of init) this.append(name, value);
    } else if (Array.isArray(init)) {
      for (const [name, value] of init) this.append(name, value);
    } else if (init) {
      for (const [name, value] of Object.entries(init)) this.append(name, value);
    }
  }
  append(name, value) {
    name = String(name).toLowerCase();
    value = String(value);
    const previous = this.#values.get(name);
    this.#values.set(name, previous === undefined ? value : `${previous}, ${value}`);
  }
  set(name, value) { this.#values.set(String(name).toLowerCase(), String(value)); }
  get(name) { return this.#values.get(String(name).toLowerCase()) ?? null; }
  has(name) { return this.#values.has(String(name).toLowerCase()); }
  delete(name) { return this.#values.delete(String(name).toLowerCase()); }
  entries() { return this.#values.entries(); }
  keys() { return this.#values.keys(); }
  values() { return this.#values.values(); }
  forEach(callback, thisArg) {
    for (const [name, value] of this.#values) callback.call(thisArg, value, name, this);
  }
  [Symbol.iterator]() { return this.entries(); }
}

function parseResponseHeaders(block) {
  const headers = new DollyHeaders();
  for (const line of String(block).split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0 && !line.startsWith("HTTP/")) {
      headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  return headers;
}

class DollyResponse {
  constructor(native) {
    this.status = native.status;
    this.statusText = "";
    this.ok = this.status >= 200 && this.status < 300;
    this.url = native.url;
    this.redirected = false;
    this.type = "basic";
    this.headers = parseResponseHeaders(native.headers);
    this.body = native.body;
    this.bodyUsed = false;
  }
  async #consume() {
    if (this.bodyUsed) throw new TypeError("response body was already consumed");
    this.bodyUsed = true;
    const chunks = [];
    let length = 0;
    const reader = this.body.getReader();
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      const bytes = item.value instanceof Uint8Array
        ? item.value : new Uint8Array(item.value);
      chunks.push(bytes);
      length += bytes.length;
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const bytes of chunks) {
      result.set(bytes, offset);
      offset += bytes.length;
    }
    return result;
  }
  async text() { return Dolly.decode(await this.#consume()); }
  async json() { return JSON.parse(await this.text()); }
  async arrayBuffer() {
    const bytes = await this.#consume();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  clone() { throw new TypeError("Janis cannot clone a streaming response"); }
}

globalThis.Headers = DollyHeaders;
globalThis.Response = DollyResponse;
const pendingHttp = new Map();

function httpError(code) {
  const messages = {
    1: "browser HTTP provider failed",
    2: "browser HTTP policy denied the request",
    3: "browser HTTP provider rejected the protocol",
  };
  return new Error(messages[code] ?? `browser HTTP error ${code}`);
}

function resolveHttpHeaders(request) {
  if (request.resolved) return;
  request.resolved = true;
  request.resolve(new DollyResponse({
    status: request.status,
    url: request.effectiveUrl || request.requestUrl,
    headers: request.headers,
    body: request.body,
  }));
}

// Polling never crosses the browser boundary itself: it only consumes the
// next record already published in shared Wasm memory by dolly_http_dispatch.
// Janis calls this hook between QuickJS microtask batches, which lets timers,
// input, and streamed response chunks make progress in one synchronous worker.
globalThis.__dollyHttpPump = () => {
  for (const [sequence, request] of pendingHttp) {
    let chunk;
    try {
      chunk = Dolly.httpPoll(sequence);
    } catch (error) {
      if (request.resolved) request.controller.error(error);
      else request.reject(error);
      pendingHttp.delete(sequence);
      continue;
    }
    if (chunk === null) continue;
    request.status = chunk.status;
    if (chunk.error) {
      const error = httpError(chunk.error);
      if (request.resolved) request.controller.error(error);
      else request.reject(error);
      pendingHttp.delete(sequence);
      continue;
    }
    if (chunk.kind === 1) {
      request.effectiveUrl += Dolly.decode(chunk.data);
    } else if (chunk.kind === 2) {
      const line = Dolly.decode(chunk.data);
      request.headers += line;
      if (line === "\r\n" || line === "\n" || line === "") {
        resolveHttpHeaders(request);
      }
    } else if (chunk.kind === 3 && chunk.data.length !== 0) {
      resolveHttpHeaders(request);
      request.controller.enqueue(chunk.data);
    }
    if (chunk.eof) {
      resolveHttpHeaders(request);
      request.controller.close();
      pendingHttp.delete(sequence);
    }
  }
  return pendingHttp.size !== 0;
};

globalThis.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : String(input.url ?? input);
  const method = String(init.method ?? input.method ?? "GET").toUpperCase();
  const headers = new DollyHeaders(input.headers);
  if (init.headers) {
    for (const [name, value] of new DollyHeaders(init.headers)) headers.set(name, value);
  }
  let body = init.body ?? input.body ?? null;
  if (body instanceof Uint8Array) body = Dolly.decode(body);
  if (body !== null && typeof body !== "string") body = String(body);
  const headerBlock = [...headers].map(([name, value]) => `${name}: ${value}\r\n`).join("");
  return new Promise((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(init.signal.reason ?? new Error("request was aborted"));
      return;
    }
    let controller;
    const stream = new ReadableStream({
      start(value) { controller = value; },
    });
    try {
      const sequence = Dolly.httpStart(method, url, headerBlock, body);
      pendingHttp.set(sequence, {
        resolve,
        reject,
        controller,
        body: stream,
        requestUrl: url,
        effectiveUrl: "",
        status: 0,
        headers: "",
        resolved: false,
      });
    } catch (error) {
      reject(error);
    }
  });
};

globalThis.performance = { now: () => Date.now(), timeOrigin: Date.now() };
globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
