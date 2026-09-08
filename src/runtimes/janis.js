// Janis: the Node-shaped runtime surface for ordinary upstream JavaScript.
// Every operation bottoms out in the in-Wasm Dolly object. This file has no
// browser globals, native host modules, filesystem mounts, or socket fallback.

globalThis.global = globalThis;
// V8 exposes this helper as a Node global. QuickJS already records stacks when
// Error objects are constructed; consumers such as Jiti only need the method
// to exist so their original diagnostics are not masked.
Error.captureStackTrace ??= () => {};

// QuickJS intentionally does not ship ICU. Pi only consumes Intl.Segmenter,
// so Janis supplies that single API in-process instead of importing locale
// services from the browser. This keeps terminal editing Unicode-safe for the
// common grapheme cases (marks, emoji modifiers/ZWJ sequences, flags, CRLF,
// and Hangul syllables) and provides the word-like grouping Pi uses for cursor
// movement and mouse selection.
const janisUnicodeMark = /\p{Mark}/u;
const janisUnicodeWord = /[\p{Alphabetic}\p{Number}]/u;
const janisUnicodeWhitespace = /\s/u;
const janisEmojiModifier = /\p{Emoji_Modifier}/u;

function janisHangulClass(codepoint) {
  if (codepoint >= 0x1100 && codepoint <= 0x115f ||
      codepoint >= 0xa960 && codepoint <= 0xa97c) return "L";
  if (codepoint >= 0x1160 && codepoint <= 0x11a7 ||
      codepoint >= 0xd7b0 && codepoint <= 0xd7c6) return "V";
  if (codepoint >= 0x11a8 && codepoint <= 0x11ff ||
      codepoint >= 0xd7cb && codepoint <= 0xd7fb) return "T";
  if (codepoint >= 0xac00 && codepoint <= 0xd7a3) {
    return (codepoint - 0xac00) % 28 === 0 ? "LV" : "LVT";
  }
  return "";
}

function janisGraphemeContinues(previous, current, regionalCount) {
  const previousCodepoint = previous.codePointAt(0);
  const currentCodepoint = current.codePointAt(0);
  if (previousCodepoint === 0x0d && currentCodepoint === 0x0a) return true;
  if (janisUnicodeMark.test(current) || janisEmojiModifier.test(current) ||
      currentCodepoint === 0x200d || currentCodepoint === 0xfe0e ||
      currentCodepoint === 0xfe0f || currentCodepoint === 0x20e3) return true;
  if (previousCodepoint === 0x200d) return true;

  const previousHangul = janisHangulClass(previousCodepoint);
  const currentHangul = janisHangulClass(currentCodepoint);
  if (previousHangul === "L" &&
      (currentHangul === "L" || currentHangul === "V" || currentHangul === "LV" ||
       currentHangul === "LVT")) return true;
  if ((previousHangul === "LV" || previousHangul === "V") &&
      (currentHangul === "V" || currentHangul === "T")) return true;
  if ((previousHangul === "LVT" || previousHangul === "T") &&
      currentHangul === "T") return true;

  const previousRegional = previousCodepoint >= 0x1f1e6 && previousCodepoint <= 0x1f1ff;
  const currentRegional = currentCodepoint >= 0x1f1e6 && currentCodepoint <= 0x1f1ff;
  return previousRegional && currentRegional && regionalCount % 2 === 1;
}

function janisSegmentGraphemes(input) {
  const result = [];
  let segment = "";
  let segmentIndex = 0;
  let index = 0;
  let previous = "";
  let regionalCount = 0;
  for (const current of input) {
    const currentCodepoint = current.codePointAt(0);
    const currentRegional = currentCodepoint >= 0x1f1e6 && currentCodepoint <= 0x1f1ff;
    if (segment !== "" && !janisGraphemeContinues(previous, current, regionalCount)) {
      result.push({ segment, index: segmentIndex, input });
      segment = "";
      segmentIndex = index;
      regionalCount = 0;
    }
    if (segment === "") segmentIndex = index;
    segment += current;
    regionalCount = currentRegional ? regionalCount + 1 : 0;
    previous = current;
    index += current.length;
  }
  if (segment !== "") result.push({ segment, index: segmentIndex, input });
  return result;
}

function janisWordClass(character) {
  if (janisUnicodeWhitespace.test(character)) return "space";
  if (janisUnicodeWord.test(character) || janisUnicodeMark.test(character) ||
      character === "_") return "word";
  return "other";
}

function janisSegmentWords(input) {
  const graphemes = janisSegmentGraphemes(input);
  const result = [];
  let current;
  let currentClass = "";
  for (const item of graphemes) {
    const itemClass = janisWordClass(item.segment);
    // Match Intl's useful behavior for Pi: words and whitespace are runs,
    // while punctuation remains independently selectable.
    if (current && itemClass === currentClass && itemClass !== "other") {
      current.segment += item.segment;
      continue;
    }
    current = {
      segment: item.segment,
      index: item.index,
      input,
      isWordLike: itemClass === "word",
    };
    result.push(current);
    currentClass = itemClass;
  }
  return result;
}

class JanisSegments {
  constructor(items, input) { this.items = items; this.input = input; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
  containing(index = 0) {
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= this.input.length) {
      return undefined;
    }
    return this.items.find((item) =>
      position >= item.index && position < item.index + item.segment.length);
  }
}

class JanisSegmenter {
  constructor(locales = undefined, options = {}) {
    const granularity = options.granularity ?? "grapheme";
    if (granularity !== "grapheme" && granularity !== "word" &&
        granularity !== "sentence") {
      throw new RangeError(`unsupported segmenter granularity: ${granularity}`);
    }
    this.locale = Array.isArray(locales) ? locales[0] ?? "en" : locales ?? "en";
    this.granularity = granularity;
  }
  segment(value) {
    const input = String(value);
    const items = this.granularity === "grapheme"
      ? janisSegmentGraphemes(input)
      : this.granularity === "word"
        ? janisSegmentWords(input)
        : input.split(/(?<=[.!?])(?:\s+|$)/u).filter(Boolean).map((segment, index, all) => ({
            segment,
            index: all.slice(0, index).reduce((length, part) => length + part.length, 0),
            input,
          }));
    return new JanisSegments(items, input);
  }
  resolvedOptions() { return { locale: String(this.locale), granularity: this.granularity }; }
  static supportedLocalesOf(locales) {
    return locales === undefined ? [] : Array.isArray(locales) ? [...locales] : [locales];
  }
}

globalThis.Intl = { Segmenter: JanisSegmenter };

class JanisEventEmitter {
  #events = new Map();

  on(name, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    const listeners = this.#events.get(name) ?? [];
    listeners.push(listener);
    this.#events.set(name, listeners);
    return this;
  }
  addListener(name, listener) { return this.on(name, listener); }
  prependListener(name, listener) {
    const listeners = this.#events.get(name) ?? [];
    listeners.unshift(listener);
    this.#events.set(name, listeners);
    return this;
  }
  once(name, listener) {
    const wrapped = (...args) => {
      this.removeListener(name, wrapped);
      listener.apply(this, args);
    };
    wrapped.listener = listener;
    return this.on(name, wrapped);
  }
  prependOnceListener(name, listener) {
    const wrapped = (...args) => {
      this.removeListener(name, wrapped);
      listener.apply(this, args);
    };
    wrapped.listener = listener;
    return this.prependListener(name, wrapped);
  }
  off(name, listener) { return this.removeListener(name, listener); }
  removeListener(name, listener) {
    const listeners = this.#events.get(name);
    if (!listeners) return this;
    const filtered = listeners.filter((candidate) =>
      candidate !== listener && candidate.listener !== listener);
    if (filtered.length) this.#events.set(name, filtered);
    else this.#events.delete(name);
    return this;
  }
  removeAllListeners(name = undefined) {
    if (name === undefined) this.#events.clear();
    else this.#events.delete(name);
    return this;
  }
  emit(name, ...args) {
    const listeners = [...(this.#events.get(name) ?? [])];
    if (name === "error" && listeners.length === 0) throw args[0];
    for (const listener of listeners) listener.apply(this, args);
    return listeners.length !== 0;
  }
  listeners(name) { return [...(this.#events.get(name) ?? [])]; }
  rawListeners(name) { return this.listeners(name); }
  listenerCount(name) { return this.#events.get(name)?.length ?? 0; }
  eventNames() { return [...this.#events.keys()]; }
  setMaxListeners() { return this; }
  getMaxListeners() { return 0; }
  static listenerCount(emitter, name) { return emitter.listenerCount(name); }
  static once(emitter, name) {
    return new Promise((resolve, reject) => {
      emitter.once(name, (...args) => resolve(args));
      if (name !== "error") emitter.once("error", reject);
    });
  }
}

class JanisTimer {
  constructor(id) { this.id = id; }
  ref() { const timer = janisTimers.get(this.id); if (timer) timer.ref = true; return this; }
  unref() { const timer = janisTimers.get(this.id); if (timer) timer.ref = false; return this; }
  hasRef() { return janisTimers.get(this.id)?.ref ?? false; }
  refresh() {
    const timer = janisTimers.get(this.id);
    if (timer) timer.due = Date.now() + timer.delay;
    return this;
  }
  [Symbol.toPrimitive]() { return this.id; }
}

let janisNextTimerId = 1;
const janisTimers = new Map();
function janisCreateTimer(callback, delay, repeat, args) {
  if (typeof callback !== "function") throw new TypeError("callback must be a function");
  const milliseconds = Math.max(0, Number(delay) || 0);
  const id = janisNextTimerId++;
  janisTimers.set(id, {
    callback,
    args,
    delay: milliseconds,
    due: Date.now() + milliseconds,
    repeat,
    ref: true,
  });
  return new JanisTimer(id);
}
globalThis.setTimeout = (callback, delay = 0, ...args) =>
  janisCreateTimer(callback, delay, false, args);
globalThis.setInterval = (callback, delay = 0, ...args) =>
  janisCreateTimer(callback, delay, true, args);
globalThis.clearTimeout = (handle) => janisTimers.delete(Number(handle?.id ?? handle));
globalThis.clearInterval = globalThis.clearTimeout;
globalThis.setImmediate = (callback, ...args) => janisCreateTimer(callback, 0, false, args);
globalThis.clearImmediate = globalThis.clearTimeout;

function runDueTimers() {
  const now = Date.now();
  for (const [id, timer] of [...janisTimers]) {
    if (timer.due > now) continue;
    if (timer.repeat) timer.due = now + Math.max(1, timer.delay);
    else janisTimers.delete(id);
    timer.callback(...timer.args);
  }
}

function timerPromise(delay, value, options = {}) {
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    if (signal?.aborted) { reject(abortError(signal.reason)); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(abortError(signal.reason)); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(value); }, delay);
    if (options.ref === false) timer.unref();
    signal?.addEventListener("abort", abort);
  });
}

class JanisStringDecoder {
  #decoder;
  constructor(encoding = "utf8") {
    this.#decoder = new TextDecoder(encoding, { ignoreBOM: true });
    this.encoding = "utf8";
  }
  write(bytes) { return typeof bytes === "string" ? bytes : this.#decoder.decode(bytes, { stream: true }); }
  end(bytes) {
    return typeof bytes === "string" ? bytes + this.#decoder.decode() : this.#decoder.decode(bytes);
  }
}

// Non-terminal line input for file scanners, pipes and simple questions.
class JanisReadline extends JanisEventEmitter {
  closed = false;
  constructor(options, output) {
    super();
    if (options?.on) options = { input: options, output };
    const { input, crlfDelay = 100 } = options;
    if (!input?.on) throw new TypeError("readline requires an input stream");
    if (options.terminal === true) throw new Error("Janis readline does not implement terminal editing");
    this.input = input;
    this.output = options.output;
    const decoder = new JanisStringDecoder();
    let pending = "", lastCR = null;
    const accept = text => {
      if (!text || this.closed) return;
      if (lastCR !== null && text[0] === "\n" && Date.now() - lastCR <= Math.max(100, crlfDelay)) text = text.slice(1);
      lastCR = null;
      let start = 0;
      for (let index = 0; index < text.length && !this.closed; index++) {
        const char = text[index];
        if (char !== "\r" && char !== "\n") continue;
        const line = pending + text.slice(start, index);
        pending = "";
        if (char === "\r") {
          if (text[index + 1] === "\n") index++;
          else if (index === text.length - 1) lastCR = Date.now();
        }
        start = index + 1;
        this.emit("line", line);
      }
      pending += text.slice(start);
    };
    const data = chunk => accept(decoder.write(chunk));
    const end = () => {
      accept(decoder.end());
      if (pending && !this.closed) this.emit("line", pending);
      this.close();
    };
    const error = value => { this.close(); this.emit("error", value); };
    const close = () => this.close();
    this.detach = () => {
      for (const [name, listener] of [["data", data], ["end", end], ["error", error], ["close", close]]) input.off(name, listener);
    };
    input.on("data", data).on("end", end).on("error", error).on("close", close);
    input.resume();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.input.pause();
    this.emit("close");
  }
  question(text, callback) {
    if (this.closed) throw new Error("readline is closed");
    this.output?.write(text);
    this.once("line", callback);
  }
  [Symbol.asyncIterator]() {
    const lines = [];
    let done = this.closed, failure, wake;
    const line = value => { lines.push(value); wake?.(); };
    const close = () => { done = true; wake?.(); };
    const error = value => { failure = value; done = true; wake?.(); };
    this.on("line", line).on("close", close).on("error", error);
    const detach = () => this.off("line", line).off("close", close).off("error", error);
    return {
      next: async () => {
        while (!lines.length && !done) await new Promise(resolve => { wake = resolve; });
        if (failure) { detach(); throw failure; }
        if (lines.length) return { value: lines.shift(), done: false };
        detach();
        return { done: true };
      },
      return: async () => { this.close(); lines.length = 0; detach(); return { done: true }; },
      [Symbol.asyncIterator]() { return this; },
    };
  }
}

class JanisStdin extends JanisEventEmitter {
  get isTTY() { return Boolean(Dolly.isatty(0)); }
  isRaw = false;
  readable = true;
  readableEncoding = null;
  #resumed = null;
  #decoder;
  on(name, listener) {
    super.on(name, listener);
    if (name === "data" && this.#resumed !== false) this.#resumed = true;
    return this;
  }
  setEncoding(encoding) {
    this.#decoder = new JanisStringDecoder(encoding);
    this.readableEncoding = this.#decoder.encoding;
    return this;
  }
  setRawMode(value) { this.isRaw = Boolean(value); return this; }
  resume() { this.#resumed = true; return this; }
  pause() { this.#resumed = false; return this; }
  isActive() { return this.#resumed && this.listenerCount("data") > 0; }
  publish(bytes) {
    if (!bytes.length || !this.isActive()) return;
    const chunk = this.#decoder ? this.#decoder.write(bytes) : Buffer.from(bytes);
    if (chunk.length) this.emit("data", chunk);
  }
  finish() {
    if (!this.readable) return;
    this.readable = false;
    this.#resumed = false;
    const tail = this.#decoder?.end();
    if (tail) this.emit("data", tail);
    this.emit("end");
  }
  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.once("end", () => destination.end());
    return destination;
  }
}

class JanisOutput extends JanisEventEmitter {
  writable = true;
  writableLength = 0;
  #error;
  constructor(error = false) { super(); this.#error = error; }
  get isTTY() { return Boolean(Dolly.isatty(this.#error ? 2 : 1)); }
  get columns() { return Dolly.terminalSize().columns || 80; }
  get rows() { return Dolly.terminalSize().rows || 24; }
  write(value, _encoding, callback) {
    const bytes = value instanceof Uint8Array ? value : String(value);
    const status = this.#error ? Dolly.stderr(bytes) : Dolly.stdout(bytes);
    if (typeof _encoding === "function") _encoding();
    else callback?.();
    return Boolean(status);
  }
  end(value, encoding, callback) {
    if (value !== undefined) this.write(value, encoding);
    callback?.();
    this.emit("finish");
  }
}

const janisStdin = new JanisStdin();
const janisStdout = new JanisOutput(false);
const janisStderr = new JanisOutput(true);
let janisTerminalSize = Dolly.terminalSize();

Object.assign(process, {
  stdin: janisStdin,
  stdout: janisStdout,
  stderr: janisStderr,
  platform: "wasm",
  arch: "wasm64",
  version: "v22.19.0-janis",
  versions: { node: "22.19.0", quickjs: "ng", janis: "0", dolly: "0" },
  features: {},
  release: { name: "janis" },
  execPath: "/usr/bin/janis",
  execArgv: [],
  argv0: "janis",
  exit(code = process.exitCode ?? 0) { Dolly.exit(Number(code)); },
  kill(pid, signal = "SIGTERM") {
    if (pid === process.pid && signal === "SIGWINCH") janisStdout.emit("resize");
    else Dolly.processKill(pid, childSignal(signal));
    return true;
  },
  hrtime(previous = undefined) {
    const nanoseconds = BigInt(Date.now()) * 1000000n;
    const seconds = Number(nanoseconds / 1000000000n);
    const remainder = Number(nanoseconds % 1000000000n);
    if (!previous) return [seconds, remainder];
    let deltaSeconds = seconds - previous[0];
    let deltaNanoseconds = remainder - previous[1];
    if (deltaNanoseconds < 0) { deltaSeconds--; deltaNanoseconds += 1000000000; }
    return [deltaSeconds, deltaNanoseconds];
  },
  uptime: () => (Date.now() - performance.timeOrigin) / 1000,
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
  resourceUsage: () => ({}),
});
process.hrtime.bigint = () => BigInt(Date.now()) * 1000000n;
const janisProcessEvents = new JanisEventEmitter();
for (const method of [
  "on", "addListener", "prependListener", "once", "prependOnceListener",
  "off", "removeListener", "removeAllListeners", "listeners", "rawListeners",
  "listenerCount", "eventNames", "setMaxListeners", "getMaxListeners",
]) {
  process[method] = (...args) => {
    const result = janisProcessEvents[method](...args);
    return result === janisProcessEvents ? process : result;
  };
}
process.emit = (name, ...args) => janisProcessEvents.emit(name, ...args);

// Buffer operations used by Pi, TypeBox, model clients, and extension loaders.
Buffer.isEncoding = (encoding) => /^(?:utf-?8|utf8|hex|base64|ascii|latin1|binary)$/i.test(encoding);
Buffer.compare = (left, right) => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
};
Buffer.prototype.equals = function(other) { return Buffer.compare(this, other) === 0; };
Buffer.prototype.slice = Buffer.prototype.subarray;
Buffer.prototype.readUInt8 = function(offset = 0) { return this[offset]; };
Buffer.prototype.readUInt16LE = function(offset = 0) { return this[offset] | this[offset + 1] << 8; };
Buffer.prototype.readUInt16BE = function(offset = 0) { return this[offset] << 8 | this[offset + 1]; };
Buffer.prototype.readUInt32LE = function(offset = 0) {
  return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 0x1000000;
};
Buffer.prototype.readUInt32BE = function(offset = 0) {
  return this[offset] * 0x1000000 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
};
Buffer.prototype.writeUInt32LE = function(value, offset = 0) {
  for (let index = 0; index < 4; index++) this[offset + index] = value >>> (index * 8);
  return offset + 4;
};
Buffer.prototype.writeUInt32BE = function(value, offset = 0) {
  for (let index = 0; index < 4; index++) this[offset + index] = value >>> ((3 - index) * 8);
  return offset + 4;
};
Buffer.prototype.write = function(value, offset = 0, length = undefined, encoding = "utf8") {
  const bytes = Buffer.from(value, encoding);
  const count = Math.min(length ?? bytes.length, bytes.length, this.length - offset);
  this.set(bytes.subarray(0, count), offset);
  return count;
};
Buffer.prototype.copy = function(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
  const source = this.subarray(sourceStart, sourceEnd);
  const count = Math.min(source.length, target.length - targetStart);
  target.set(source.subarray(0, count), targetStart);
  return count;
};

function normalizePath(...values) {
  const joined = values.filter((value) => value !== "").join("/");
  const absolute = joined.startsWith("/");
  const parts = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (!absolute) parts.push("..");
    }
    else parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
}
function resolvePath(...values) {
  let resolved = "";
  for (let index = values.length - 1; index >= -1; index--) {
    const value = index >= 0 ? String(values[index]) : Dolly.cwd();
    if (!value) continue;
    resolved = `${value}/${resolved}`;
    if (value.startsWith("/")) break;
  }
  return normalizePath(resolved);
}
function dirname(path) {
  path = normalizePath(String(path));
  if (path === "/") return "/";
  const index = path.lastIndexOf("/");
  return index < 0 ? "." : index === 0 ? "/" : path.slice(0, index);
}
function basename(path, suffix = "") {
  const value = normalizePath(String(path)).split("/").at(-1) ?? "";
  return suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}
function extname(path) {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index);
}
function relative(from, to) {
  const left = resolvePath(from).split("/").filter(Boolean);
  const right = resolvePath(to).split("/").filter(Boolean);
  while (left.length && right.length && left[0] === right[0]) { left.shift(); right.shift(); }
  return [...left.map(() => ".."), ...right].join("/") || "";
}
const janisPath = {
  sep: "/",
  delimiter: ":",
  normalize: normalizePath,
  resolve: resolvePath,
  join: (...values) => normalizePath(...values.map(String)),
  dirname,
  basename,
  extname,
  relative,
  isAbsolute: (path) => String(path).startsWith("/"),
  parse(path) {
    const dir = dirname(path); const base = basename(path); const ext = extname(path);
    return { root: String(path).startsWith("/") ? "/" : "", dir, base, ext, name: ext ? base.slice(0, -ext.length) : base };
  },
  format(parts) {
    const directory = parts.dir || parts.root || "";
    const base = parts.base || `${parts.name ?? ""}${parts.ext ?? ""}`;
    return directory === "/" ? `/${base}` : directory ? `${directory}/${base}` : base;
  },
  toNamespacedPath: (path) => path,
};
janisPath.posix = janisPath;
janisPath.win32 = janisPath;

class JanisStats {
  constructor(native) { Object.assign(this, native); }
  isFile() { return this.kind === "file"; }
  isDirectory() { return this.kind === "directory"; }
  isSymbolicLink() { return this.kind === "symlink"; }
  isBlockDevice() { return false; }
  isCharacterDevice() { return false; }
  isFIFO() { return false; }
  isSocket() { return false; }
  get mtime() { return new Date(this.mtimeMs); }
  get ctime() { return this.mtime; }
  get birthtime() { return this.mtime; }
}
class JanisDirent extends JanisStats {
  constructor(name, native) { super(native); this.name = name; this.parentPath = ""; this.path = ""; }
}
function makeFsError(error, path, syscall) {
  const result = error && typeof error === "object"
    ? error
    : new Error(String(error));
  if (!result.code) {
    const message = String(result.message ?? result);
    result.code = message.includes("No such file or directory") ? "ENOENT"
      : message.includes("File exists") ? "EEXIST"
        : message.includes("Not a directory") ? "ENOTDIR"
          : message.includes("Is a directory") ? "EISDIR"
            : message.includes("Directory not empty") ? "ENOTEMPTY"
              : "EIO";
  }
  result.path ??= String(path);
  result.syscall ??= syscall;
  return result;
}
function fsNative(path, syscall, operation) {
  try { return operation(); }
  catch (error) { throw makeFsError(error, path, syscall); }
}
function fsStat(path) {
  return new JanisStats(fsNative(path, "stat", () => Dolly.fsStat(String(path))));
}
function fsLstat(path) {
  return new JanisStats(fsNative(path, "lstat", () => Dolly.fsLstat(String(path))));
}
function fsFstat(descriptor) {
  return new JanisStats(Dolly.fsFstat(fsDescriptor(descriptor)));
}
function fsExists(path) { try { Dolly.fsAccess(String(path)); return true; } catch { return false; } }
function fsMkdir(path, options = {}) {
  path = resolvePath(path);
  const recursive = options === true || options?.recursive;
  if (!recursive) {
    fsNative(path, "mkdir", () => Dolly.fsMkdir(path));
    return;
  }
  let current = path.startsWith("/") ? "/" : "";
  for (const part of path.split("/").filter(Boolean)) {
    current = current === "/" ? `/${part}` : current ? `${current}/${part}` : part;
    if (!fsExists(current)) {
      try { fsNative(current, "mkdir", () => Dolly.fsMkdir(current)); }
      catch (error) { if (error.code !== "EEXIST" || !fsStat(current).isDirectory()) throw error; }
    }
    else if (!fsStat(current).isDirectory()) {
      throw Object.assign(new Error(`ENOTDIR: not a directory, mkdir '${current}'`), {
        code: "ENOTDIR", path: current, syscall: "mkdir",
      });
    }
  }
}
function fsRead(path, options = undefined) {
  const bytes = withFile(path, options?.flag ?? "r", (fd) => {
    const chunks = [];
    const block = Buffer.alloc(65536);
    for (;;) {
      const count = readSync(fd, block, 0, block.length);
      if (!count) return Buffer.concat(chunks);
      chunks.push(Buffer.from(block.subarray(0, count)));
    }
  });
  const encoding = typeof options === "string" ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : bytes;
}
function fsWrite(path, data, options = undefined) {
  const encoding = typeof options === "string" ? options : options?.encoding ?? "utf8";
  const bytes = ArrayBuffer.isView(data) ? fsBytes(data) : Buffer.from(String(data), encoding);
  withFile(path, options?.flag ?? "w", (fd) => {
    for (let offset = 0; offset < bytes.length;) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset);
      if (!count) throw Object.assign(new Error("write made no progress"), { code: "EIO" });
      offset += count;
    }
  });
}
function fsAppend(path, data, options = undefined) {
  fsWrite(path, data, typeof options === "string"
    ? { encoding: options, flag: "a" } : { flag: "a", ...options });
}
function withFile(path, flags, operation) {
  if (typeof path === "number") return operation(fsDescriptor(path));
  const fd = openSync(path, flags);
  try { return operation(fd); } finally { closeSync(fd); }
}
function fsReaddir(path, options = undefined) {
  const names = fsNative(path, "scandir", () => Dolly.fsReaddir(String(path)));
  if (!options?.withFileTypes) return names;
  return names.map((name) => Object.assign(new JanisDirent(name, fsLstat(janisPath.join(path, name))), {
    parentPath: String(path), path: String(path),
  }));
}
function fsRemove(path, options = {}) {
  path = String(path);
  let metadata;
  try { metadata = fsLstat(path); }
  catch (error) {
    if (options?.force && error.code === "ENOENT") return;
    throw error;
  }
  if (metadata.isDirectory()) {
    if (options?.recursive) for (const name of fsReaddir(path)) fsRemove(janisPath.join(path, name), options);
    fsNative(path, "rmdir", () => Dolly.fsRmdir(path));
  } else fsNative(path, "unlink", () => Dolly.fsUnlink(path));
}
function fsRealpath(path) {
  return fsNative(path, "realpath", () => Dolly.realpath(String(path)));
}

function janisGlobSegment(pattern, value) {
  if (value.startsWith(".") && !pattern.startsWith(".")) return false;
  let source = "^";
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === "*") source += ".*";
    else if (character === "?") source += ".";
    else if (character === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close < 0) source += "\\[";
      else {
        let body = pattern.slice(index + 1, close);
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        else if (body.startsWith("^")) body = `\\${body}`;
        source += `[${body.replaceAll("\\", "\\\\")}]`;
        index = close;
      }
    }
    else source += character.replace(/[\\^$.*+?(){}|]/g, "\\$&");
  }
  return new RegExp(`${source}$`, "u").test(value);
}

function janisGlobMatches(pattern, path) {
  const patternParts = pattern.split("/").filter((part) => part !== "");
  const pathParts = path.split("/").filter((part) => part !== "");
  const memo = new Map();
  const visit = (patternIndex, pathIndex) => {
    const key = `${patternIndex}:${pathIndex}`;
    if (memo.has(key)) return memo.get(key);
    let matched;
    if (patternIndex === patternParts.length) matched = pathIndex === pathParts.length;
    else if (patternParts[patternIndex] === "**") {
      while (patternParts[patternIndex + 1] === "**") patternIndex++;
      matched = visit(patternIndex + 1, pathIndex) ||
        (pathIndex < pathParts.length && !pathParts[pathIndex].startsWith(".") &&
          visit(patternIndex, pathIndex + 1));
    }
    else matched = pathIndex < pathParts.length &&
      janisGlobSegment(patternParts[patternIndex], pathParts[pathIndex]) &&
      visit(patternIndex + 1, pathIndex + 1);
    memo.set(key, matched);
    return matched;
  };
  return visit(0, 0);
}

function janisGlobWalk(root) {
  const entries = [];
  const walk = (directory, relativeDirectory) => {
    for (const name of fsReaddir(directory).sort()) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const absolutePath = janisPath.join(directory, name);
      const metadata = fsLstat(absolutePath);
      entries.push({ relativePath, absolutePath, metadata });
      // Do not traverse symbolic links: glob walks must remain cycle-free.
      if (metadata.isDirectory()) walk(absolutePath, relativePath);
    }
  };
  walk(root, "");
  return entries;
}

function fsGlobSync(pattern, options = {}) {
  if (options.followSymlinks) {
    throw Object.assign(new Error("Janis glob does not follow symbolic links"), {
      code: "ERR_METHOD_NOT_IMPLEMENTED",
    });
  }
  const cwdValue = options.cwd instanceof URL
    ? decodeURIComponent(options.cwd.pathname)
    : options.cwd ?? Dolly.cwd();
  const cwd = resolvePath(String(cwdValue));
  const patterns = (Array.isArray(pattern) ? pattern : [pattern]).map(String);
  const found = new Map();
  for (let candidatePattern of patterns) {
    const absolute = candidatePattern.startsWith("/");
    while (candidatePattern.startsWith("./")) candidatePattern = candidatePattern.slice(2);
    const root = absolute ? "/" : cwd;
    const matchPattern = absolute ? candidatePattern.slice(1) : candidatePattern;
    for (const entry of janisGlobWalk(root)) {
      if (!janisGlobMatches(matchPattern, entry.relativePath)) continue;
      const value = absolute ? entry.absolutePath : entry.relativePath;
      found.set(value, entry);
    }
  }

  const excluded = options.exclude;
  const excludePatterns = Array.isArray(excluded) ? excluded.map(String) : [];
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right))
    .filter(([value, entry]) => {
      const visible = options.withFileTypes
        ? Object.assign(new JanisDirent(basename(value), entry.metadata), {
            parentPath: dirname(entry.absolutePath), path: dirname(entry.absolutePath),
          })
        : value;
      if (typeof excluded === "function" && excluded(visible)) return false;
      return !excludePatterns.some((excludedPattern) =>
        janisGlobMatches(excludedPattern, value));
    })
    .map(([value, entry]) => options.withFileTypes
      ? Object.assign(new JanisDirent(basename(value), entry.metadata), {
          parentPath: dirname(entry.absolutePath), path: dirname(entry.absolutePath),
        })
      : value);
}

function callbackResult(operation, callback) {
  queueMicrotask(() => {
    try { callback(null, operation()); } catch (error) { callback(error); }
  });
}
function fsDescriptor(descriptor) {
  if (!Number.isInteger(descriptor) || descriptor < 0 || descriptor > 0x7fffffff) {
    throw Object.assign(new Error("invalid file descriptor"), { code: "EBADF" });
  }
  return descriptor;
}
function fsBytes(buffer) {
  if (!ArrayBuffer.isView(buffer)) throw new TypeError("file I/O requires an ArrayBuffer view");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
function fsIndex(value, name, limit = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) {
    throw new RangeError(`${name} is out of range`);
  }
  return value;
}
function openSync(path, flags = "r") {
  if (typeof flags === "string") {
    const c = Dolly.fsConstants;
    const modes = {
      r: c.O_RDONLY, "r+": c.O_RDWR,
      rs: c.O_RDONLY | c.O_SYNC, "rs+": c.O_RDWR | c.O_SYNC,
      w: c.O_WRONLY | c.O_CREAT | c.O_TRUNC, "w+": c.O_RDWR | c.O_CREAT | c.O_TRUNC,
      a: c.O_WRONLY | c.O_CREAT | c.O_APPEND, "a+": c.O_RDWR | c.O_CREAT | c.O_APPEND,
    };
    modes.wx = modes.w | c.O_EXCL; modes["wx+"] = modes["w+"] | c.O_EXCL;
    modes.ax = modes.a | c.O_EXCL; modes["ax+"] = modes["a+"] | c.O_EXCL;
    if (!Object.hasOwn(modes, flags)) throw new TypeError(`unsupported file flags: ${flags}`);
    flags = modes[flags];
  }
  fsIndex(flags, "flags", 0x7fffffff);
  const c = Dolly.fsConstants;
  const supported = c.O_WRONLY | c.O_RDWR | c.O_CREAT | c.O_EXCL | c.O_TRUNC |
    c.O_APPEND | c.O_DIRECTORY | c.O_NOFOLLOW | c.O_SYNC;
  if (flags & ~supported) {
    throw Object.assign(new Error("unsupported file flags"), { code: "ENOTSUP" });
  }
  return fsNative(path, "open", () => Dolly.fsOpen(String(path), flags));
}
function closeSync(descriptor) { return Dolly.fsClose(fsDescriptor(descriptor)); }
function fileIo(writing, descriptor, buffer, offset, length, position) {
  descriptor = fsDescriptor(descriptor);
  const bytes = fsBytes(buffer);
  offset = fsIndex(offset ?? 0, "offset", bytes.length);
  length = fsIndex(length ?? bytes.length - offset, "length", bytes.length - offset);
  if (position != null) fsIndex(position, "position");
  return (writing ? Dolly.fsWrite : Dolly.fsRead)(descriptor, bytes, offset, length, position);
}
function writeSync(descriptor, data, offset, length, position = null) {
  if (typeof data === "string") {
    const bytes = Buffer.from(data, length ?? "utf8");
    return fileIo(true, descriptor, bytes, 0, bytes.length, offset);
  }
  if (offset && typeof offset === "object") ({ offset, length, position } = offset);
  return fileIo(true, descriptor, data, offset, length, position);
}
function readSync(descriptor, buffer, offset, length, position = null) {
  if (offset && typeof offset === "object") ({ offset, length, position } = offset);
  return fileIo(false, descriptor, buffer, offset, length, position);
}

class JanisReadable extends JanisEventEmitter {
  readable = true;
  readableEncoding = null;
  #decoder;
  setEncoding(encoding) {
    this.#decoder = new JanisStringDecoder(encoding);
    this.readableEncoding = this.#decoder.encoding;
    return this;
  }
  pipe(destination) { this.on("data", (chunk) => destination.write(chunk)); this.once("end", () => destination.end()); return destination; }
  push(chunk) {
    if (!this.readable) return false;
    if (chunk === null) {
      this.readable = false;
      const tail = this.#decoder?.end();
      if (tail) this.emit("data", tail);
      this.emit("end");
    } else {
      const value = this.#decoder ? this.#decoder.write(chunk) : chunk;
      if (!this.#decoder || value.length) this.emit("data", value);
    }
    return true;
  }
  resume() { return this; }
  pause() { return this; }
  destroy(error) { if (error) this.emit("error", error); this.emit("close"); return this; }
  [Symbol.asyncIterator]() {
    const chunks = []; let done = false; let wake;
    this.on("data", (chunk) => { chunks.push(chunk); wake?.(); });
    this.on("end", () => { done = true; wake?.(); });
    return { next: async () => { while (!chunks.length && !done) await new Promise((resolve) => { wake = resolve; }); return chunks.length ? { value: chunks.shift(), done: false } : { done: true }; } };
  }
  static from(value) {
    const stream = new JanisReadable();
    queueMicrotask(async () => { for await (const chunk of value) stream.push(chunk); stream.push(null); });
    return stream;
  }
}
class JanisWritable extends JanisEventEmitter {
  writable = true;
  writableLength = 0;
  write(chunk, encoding, callback) {
    if (this._write) this._write(chunk, encoding, callback ?? (() => {}));
    else callback?.();
    return true;
  }
  end(chunk, encoding, callback) { if (chunk !== undefined) this.write(chunk, encoding); callback?.(); this.emit("finish"); }
  destroy(error) { if (error) this.emit("error", error); this.emit("close"); return this; }
}
class JanisDuplex extends JanisReadable {
  write(chunk, encoding, callback) {
    if (this._write) this._write(chunk, encoding, callback ?? (() => {}));
    else callback?.();
    return true;
  }
  end(chunk) { if (chunk !== undefined) this.write(chunk); this.emit("finish"); this.push(null); }
}
class JanisTransform extends JanisDuplex {
  _write(chunk, encoding, callback) {
    if (this._transform) this._transform(chunk, encoding, (error, output) => { if (output !== undefined) this.push(output); callback(error); });
    else { this.push(chunk); callback(); }
  }
}
class JanisPassThrough extends JanisTransform {}

function createReadStream(path, options = {}) {
  const stream = new JanisReadable();
  queueMicrotask(() => {
    try { stream.push(fsRead(path, options.encoding)); stream.push(null); stream.emit("close"); }
    catch (error) { stream.emit("error", error); }
  });
  return stream;
}
function createWriteStream(path, options = {}) {
  const chunks = [];
  const stream = new JanisWritable();
  stream._write = (chunk, _encoding, callback) => { chunks.push(Buffer.from(chunk)); callback(); };
  stream.end = (chunk, encoding, callback) => {
    if (chunk !== undefined) stream.write(chunk, encoding);
    try { (options.flags === "a" ? fsAppend : fsWrite)(path, Buffer.concat(chunks)); callback?.(); stream.emit("finish"); stream.emit("close"); }
    catch (error) { stream.emit("error", error); }
  };
  return stream;
}

const janisFs = {
  constants: { ...Dolly.fsConstants, F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, COPYFILE_EXCL: 1 },
  Stats: JanisStats,
  Dirent: JanisDirent,
  existsSync: fsExists,
  statSync: fsStat,
  lstatSync: fsLstat,
  fstatSync: fsFstat,
  readFileSync: fsRead,
  writeFileSync: fsWrite,
  appendFileSync: fsAppend,
  mkdirSync: fsMkdir,
  readdirSync: fsReaddir,
  globSync: fsGlobSync,
  glob(pattern, options, callback) {
    if (typeof options === "function") { callback = options; options = {}; }
    callbackResult(() => fsGlobSync(pattern, options), callback);
  },
  unlinkSync: (path) => fsNative(path, "unlink", () => Dolly.fsUnlink(String(path))),
  rmdirSync: (path) => fsNative(path, "rmdir", () => Dolly.fsRmdir(String(path))),
  rmSync: fsRemove,
  renameSync: (from, to) => Dolly.fsRename(String(from), String(to)),
  copyFileSync: (from, to) => Dolly.fsCopy(String(from), String(to)),
  realpathSync: fsRealpath,
  accessSync: (path) => fsNative(path, "access", () => Dolly.fsAccess(String(path))),
  utimesSync: (path, atime, mtime) => fsNative(path, "utimes", () => Dolly.fsUtimes(
    String(path), atime instanceof Date ? atime.getTime() / 1000 : Number(atime),
    mtime instanceof Date ? mtime.getTime() / 1000 : Number(mtime))),
  // Dolly intentionally has no permission model.
  chmodSync() {},
  openSync,
  closeSync,
  readSync,
  writeSync,
  createReadStream,
  createWriteStream,
  mkdtempSync: (prefix) => { const path = `${prefix}${Math.random().toString(16).slice(2, 10)}`; fsMkdir(path, { recursive: true }); return path; },
  watch() { throw Object.assign(new Error("filesystem watching is not supported"), { code: "ERR_METHOD_NOT_IMPLEMENTED" }); },
  watchFile() { return janisFs.watch(); },
  unwatchFile() {},
};

const janisFsPromises = {
  access: async (path) => janisFs.accessSync(path),
  stat: async (path) => janisFs.statSync(path),
  lstat: async (path) => janisFs.lstatSync(path),
  fstat: async (fd) => janisFs.fstatSync(fd),
  readFile: async (path, options) => janisFs.readFileSync(path, options),
  writeFile: async (path, data, options) => janisFs.writeFileSync(path, data, options),
  appendFile: async (path, data, options) => janisFs.appendFileSync(path, data, options),
  mkdir: async (path, options) => janisFs.mkdirSync(path, options),
  readdir: async (path, options) => janisFs.readdirSync(path, options),
  unlink: async (path) => janisFs.unlinkSync(path),
  rm: async (path, options) => janisFs.rmSync(path, options),
  rmdir: async (path, options) => janisFs.rmSync(path, options),
  rename: async (from, to) => janisFs.renameSync(from, to),
  copyFile: async (from, to) => janisFs.copyFileSync(from, to),
  realpath: async (path) => janisFs.realpathSync(path),
  utimes: async (path, atime, mtime) => janisFs.utimesSync(path, atime, mtime),
  mkdtemp: async (prefix) => janisFs.mkdtempSync(prefix),
  chmod: async () => {},
  open: async (path, flags) => {
    let fd = openSync(path, flags);
    const current = () => fsDescriptor(fd);
    return {
      get fd() { return fd; },
      read: async (buffer, offset, length, position) => ({ bytesRead: readSync(current(), buffer, offset, length, position), buffer }),
      write: async (buffer, offset, length, position) => ({ bytesWritten: writeSync(current(), buffer, offset, length, position), buffer }),
      readFile: async (options) => fsRead(current(), options),
      writeFile: async (data, options) => fsWrite(current(), data, options),
      appendFile: async (data, options) => fsAppend(current(), data, options),
      close: async () => { if (fd !== -1) { closeSync(fd); fd = -1; } },
      stat: async () => fsFstat(current()),
    };
  },
};
for (const [name, sync] of [
  ["access", janisFs.accessSync], ["stat", janisFs.statSync], ["lstat", janisFs.lstatSync], ["fstat", janisFs.fstatSync],
  ["readFile", janisFs.readFileSync], ["writeFile", janisFs.writeFileSync],
  ["appendFile", janisFs.appendFileSync], ["mkdir", janisFs.mkdirSync],
  ["readdir", janisFs.readdirSync], ["unlink", janisFs.unlinkSync], ["rmdir", janisFs.rmdirSync],
  ["rm", janisFs.rmSync], ["rename", janisFs.renameSync], ["copyFile", janisFs.copyFileSync],
  ["realpath", janisFs.realpathSync], ["utimes", janisFs.utimesSync],
]) {
  janisFs[name] = (...args) => {
    const callback = typeof args.at(-1) === "function" ? args.pop() : undefined;
    if (!callback) return janisFsPromises[name](...args);
    callbackResult(() => sync(...args), callback);
  };
}
janisFs.promises = janisFsPromises;

function quoteShell(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }
const janisChildren = new Map();
const childSignals = { SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };
function unsupportedChild(message) { return Object.assign(new Error(message), { code: "ENOTSUP" }); }
function childSignal(signal = "SIGTERM") {
  const number = typeof signal === "string" ? childSignals[signal] : signal;
  if (![0, 2, 9, 15].includes(number)) throw unsupportedChild("Dolly supports signal 0, SIGINT, SIGKILL and SIGTERM");
  return number;
}
function abortError(reason) {
  return Object.assign(new Error("The operation was aborted", { cause: reason }), { name: "AbortError", code: "ABORT_ERR" });
}
function childString(value) {
  const text = String(value);
  if (text.includes("\0")) throw new TypeError("process strings cannot contain NUL");
  return text;
}
function childOptions(command, args, options) {
  if (options.detached || options.uid !== undefined || options.gid !== undefined ||
      options.serialization !== undefined || options.windowsVerbatimArguments)
    throw unsupportedChild("Dolly does not support detached processes, identities or IPC");
  if (options.timeout !== undefined && (!Number.isInteger(options.timeout) || options.timeout < 0 || options.timeout > 86400000))
    throw new RangeError("child timeout is out of range");
  if (options.maxBuffer !== undefined && (!Number.isSafeInteger(options.maxBuffer) || options.maxBuffer < 0))
    throw new RangeError("maxBuffer must be a nonnegative integer");
  const killSignal = childSignal(options.killSignal);
  if (killSignal === 0) throw unsupportedChild("a child kill signal must terminate");
  let stdio = options.stdio ?? "pipe";
  if (typeof stdio === "string") stdio = [stdio, stdio, stdio];
  if (!Array.isArray(stdio) || stdio.length > 3) throw unsupportedChild("Dolly only inherits stdin, stdout and stderr");
  stdio = [0, 1, 2].map(index => stdio[index] ?? "pipe");
  if (stdio.some(value => !["pipe", "ignore", "inherit"].includes(value) &&
      !(Number.isInteger(value) && value >= 0) && !(Number.isInteger(value?.fd) && value.fd >= 0)))
    throw unsupportedChild("unsupported child stdio");
  const cwd = resolvePath(childString(options.cwd ?? Dolly.cwd()));
  const env = Object.entries(options.env ?? process.env).filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (!key || key.includes("=")) throw new TypeError("invalid environment name");
      return childString(key) + "=" + childString(value);
    });
  const environment = Object.fromEntries(env.map(entry => { const index = entry.indexOf("="); return [entry.slice(0, index), entry.slice(index + 1)]; }));
  let path = childString(command);
  let argv = [childString(options.argv0 ?? path), ...args.map(childString)];
  if (options.shell) {
    const text = [path, ...args.map(childString)].join(" ");
    path = typeof options.shell === "string" ? childString(options.shell) : "/bin/slop";
    argv = [path, "-c", text];
  }
  if (!path.includes("/")) {
    path = (environment.PATH ?? "/bin:/usr/bin").split(":")
      .map(directory => janisPath.resolve(cwd, directory, path)).find(candidate => {
        try { return fsStat(candidate).isFile(); } catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return false; throw error; }
      });
    if (!path) throw Object.assign(new Error(`executable not found: ${command}`), { code: "ENOENT", path: String(command), syscall: "spawn" });
  } else path = janisPath.resolve(cwd, path);
  return { path, argv, env, cwd, stdio, killSignal };
}
function closeChildFd(record, index) {
  if (record.fds[index] !== null) Dolly.fsClose(record.fds[index]);
  record.fds[index] = null;
}
function childInput(record) {
  const stream = new JanisWritable();
  stream.write = (chunk, encoding, callback) => {
    if (typeof encoding === "function") { callback = encoding; encoding = undefined; }
    if (record.inputEnded || record.fds[0] === null) {
      const error = Object.assign(new Error("child stdin is closed"), { code: "EPIPE" });
      queueMicrotask(() => { callback?.(error); stream.emit("error", error); });
      return false;
    }
    const bytes = Buffer.from(chunk, encoding);
    if (bytes.length === 0) { queueMicrotask(() => callback?.()); return true; }
    record.input.push({ bytes, offset: 0, callback });
    stream.writableLength += bytes.length;
    return stream.writableLength < 65536;
  };
  stream.end = (chunk, encoding, callback) => {
    if (typeof chunk === "function") { callback = chunk; chunk = undefined; }
    if (typeof encoding === "function") { callback = encoding; encoding = undefined; }
    if (chunk !== undefined) stream.write(chunk, encoding);
    if (callback) stream.once("finish", callback);
    record.inputEnded = true;
    stream.writable = false;
    return stream;
  };
  stream.destroy = error => {
    closeChildFd(record, 0);
    record.input.length = 0;
    stream.writableLength = 0;
    stream.writable = false;
    if (error) stream.emit("error", error);
    stream.emit("close");
    return stream;
  };
  return stream;
}
function childOutput(record, index) {
  const stream = new JanisReadable();
  stream.pause = () => { record.paused[index] = true; return stream; };
  stream.resume = () => { record.paused[index] = false; return stream; };
  stream.destroy = error => {
    closeChildFd(record, index);
    stream.readable = false;
    if (error) stream.emit("error", error);
    stream.emit("close");
    return stream;
  };
  return stream;
}
function spawn(command, args = [], options = {}) {
  if (!Array.isArray(args)) { options = args ?? {}; args = []; }
  // Invalid arguments throw; unavailable process facilities and executables
  // fail through the ChildProcess error event without starting a child.
  let config, startError;
  try { config = childOptions(command, args, options); }
  catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTSUP") throw error; startError = error; }
  const child = new JanisEventEmitter();
  const record = { child, fds: [null, null, null], paused: [false, false, false], input: [], inputEnded: false, waited: false,
    closed: false, pumping: false, ref: true, timer: null, abort: null, signal: options.signal };
  child.pid = undefined;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.stdin = child.stdout = child.stderr = null;
  child.kill = (signal = "SIGTERM") => {
    const number = childSignal(signal);
    if (!child.pid || record.waited || record.closed) return false;
    try { Dolly.processKill(child.pid, number); }
    catch (error) { if (error.code === "ESRCH") return false; throw error; }
    if (number !== 0) child.killed = true;
    return true;
  };
  child.ref = () => { record.ref = true; return child; };
  child.unref = () => { record.ref = false; return child; };
  const owned = [];
  try {
    if (startError) throw startError;
    const descriptors = config.stdio.map((mode, index) => {
      if (mode === "inherit") return index;
      if (mode === "pipe") {
        const pair = Dolly.fsPipe();
        owned.push(...pair);
        record.fds[index] = pair[index === 0 ? 1 : 0];
        return pair[index === 0 ? 0 : 1];
      }
      if (mode === "ignore") {
        const descriptor = Dolly.fsOpen("/dev/null", index === 0 ? Dolly.fsConstants.O_RDONLY : Dolly.fsConstants.O_WRONLY);
        owned.push(descriptor);
        return descriptor;
      }
      return typeof mode === "number" ? mode : mode.fd;
    });
    child.pid = Dolly.processSpawn(config.path, config.argv, config.env, config.cwd, descriptors, -1);
    child.spawnfile = config.path;
    child.spawnargs = config.argv;
    for (const descriptor of owned) if (!record.fds.includes(descriptor)) Dolly.fsClose(descriptor);
    owned.length = 0;
    child.stdin = record.fds[0] === null ? null : childInput(record);
    child.stdout = record.fds[1] === null ? null : childOutput(record, 1);
    child.stderr = record.fds[2] === null ? null : childOutput(record, 2);
    janisChildren.set(child, record);
    if (options.timeout > 0) record.timer = setTimeout(() => { record.timedOut = true; child.kill(config.killSignal); }, options.timeout);
    record.abort = () => { if (child.kill(config.killSignal)) child.emit("error", abortError(options.signal.reason)); };
    options.signal?.addEventListener("abort", record.abort);
    queueMicrotask(() => {
      child.emit("spawn");
      if (options.signal?.aborted) record.abort();
    });
  } catch (error) {
    for (const descriptor of owned) Dolly.fsClose(descriptor);
    record.closed = true;
    queueMicrotask(() => { child.emit("error", error); child.emit("close", null, null); });
  }
  child.stdio = [child.stdin, child.stdout, child.stderr];
  return child;
}
function pumpChildren() {
  let completed = false;
  for (const record of [...janisChildren.values()]) {
    if (record.pumping || record.closed) continue;
    record.pumping = true;
    const { child } = record;
    try {
      const queries = record.fds.map((fd, index) => [fd ?? -1, index === 0 ? Dolly.fsConstants.POLLOUT : Dolly.fsConstants.POLLIN]);
      const ready = Dolly.fsPoll(queries, 0);
      for (const index of [1, 2]) {
        if (record.fds[index] === null || !ready[index] || record.paused[index] ||
            (!record.waited && child.stdio[index].listenerCount("data") === 0)) continue;
        const bytes = Buffer.alloc(16384);
        const count = Dolly.fsRead(record.fds[index], bytes, 0, bytes.length);
        if (count) child.stdio[index].push(bytes.subarray(0, count));
        else { closeChildFd(record, index); child.stdio[index].push(null); }
      }
      if (record.fds[0] !== null) {
        if (ready[0] & (Dolly.fsConstants.POLLERR | Dolly.fsConstants.POLLHUP)) {
          const error = record.input.length ? Object.assign(new Error("child closed stdin"), { code: "EPIPE" }) : undefined;
          child.stdin.destroy(error);
        } else if (record.input.length && ready[0]) {
          const entry = record.input[0];
          const count = Dolly.fsWrite(record.fds[0], entry.bytes, entry.offset, Math.min(16384, entry.bytes.length - entry.offset));
          entry.offset += count;
          child.stdin.writableLength -= count;
          if (entry.offset === entry.bytes.length) { record.input.shift(); entry.callback?.(); }
          if (!record.input.length) child.stdin.emit("drain");
        }
        if (record.fds[0] !== null && record.inputEnded && !record.input.length) {
          closeChildFd(record, 0);
          child.stdin.emit("finish");
          child.stdin.emit("close");
        }
      }
      if (!record.waited) {
        const result = Dolly.processWait(child.pid);
        if (result !== null) {
          record.waited = true;
          child.exitCode = result.status;
          child.signalCode = Object.keys(childSignals).find(name => childSignals[name] === result.signal) ?? null;
          clearTimeout(record.timer);
          record.signal?.removeEventListener("abort", record.abort);
          if (record.fds[0] !== null) child.stdin.destroy();
          child.emit("exit", child.exitCode, child.signalCode);
        }
      }
      if (record.waited && record.fds.every(fd => fd === null)) {
        completed = true;
        record.closed = true;
        janisChildren.delete(child);
        child.emit("close", child.exitCode, child.signalCode);
      }
    } finally { record.pumping = false; }
  }
  return completed;
}
function collectChild(command, args, options, onStdout, onStderr) {
  const child = spawn(command, args, options);
  const record = janisChildren.get(child);
  let closed = false, error;
  const chunks = [[], []];
  const lengths = [0, 0];
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  child.on("error", value => { error = value; });
  child.once("close", () => { closed = true; });
  for (const [index, stream, callback] of [[0, child.stdout, onStdout], [1, child.stderr, onStderr]]) {
    stream?.on("data", bytes => {
      if (callback) callback(bytes);
      else {
        lengths[index] += bytes.length;
        if (lengths[index] > maxBuffer) {
          error = Object.assign(new Error("child output exceeded maxBuffer"), { code: "ENOBUFS" });
          child.kill("SIGKILL");
        } else chunks[index].push(Buffer.from(bytes));
      }
    });
  }
  child.stdin?.end(options.input ?? Buffer.alloc(0));
  try {
    while (!closed) {
      Dolly.pumpJobs();
      if (!closed) globalThis.__janisPump();
    }
  } catch (failure) {
    child.kill("SIGKILL");
    child.stdout?.removeAllListeners("data");
    child.stderr?.removeAllListeners("data");
    while (!closed) { pumpChildren(); if (!closed) Dolly.fsPoll([], 1); }
    throw failure;
  }
  const output = chunks.map(parts => Buffer.concat(parts));
  if (record?.timedOut && !error) error = Object.assign(new Error("child timed out"), { code: "ETIMEDOUT" });
  const decode = bytes => options.encoding && options.encoding !== "buffer" ? bytes.toString(options.encoding) : bytes;
  return { pid: child.pid, status: child.exitCode, signal: child.signalCode, error,
    stdout: decode(output[0]), stderr: decode(output[1]), output: [null, ...output.map(decode)] };
}
function spawnSync(command, args = [], options = {}) {
  if (!Array.isArray(args)) { options = args ?? {}; args = []; }
  return collectChild(command, args, options);
}
function runChild(command, args = [], options = {}) {
  return spawnSync(command, args, { ...options, encoding: "utf8" });
}
function execResult(child, options, callback) {
  const buffers = [[], []], lengths = [0, 0];
  const maximum = options.maxBuffer ?? 1024 * 1024;
  let failure;
  for (const [index, stream] of [[0, child.stdout], [1, child.stderr]]) {
    stream?.on("data", chunk => {
      const bytes = Buffer.from(chunk);
      lengths[index] += bytes.length;
      if (lengths[index] <= maximum) buffers[index].push(bytes);
      else if (!failure) {
        failure = Object.assign(new Error("child output exceeded maxBuffer"), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
        child.kill(options.killSignal);
      }
    });
  }
  child.once("error", error => { failure = error; });
  child.once("close", (status, signal) => {
    const output = buffers.map(parts => {
      const bytes = Buffer.concat(parts);
      return options.encoding === "buffer" ? bytes : bytes.toString(options.encoding ?? "utf8");
    });
    if (!failure && (status !== 0 || signal !== null))
      failure = Object.assign(new Error("command exited " + (signal ?? status)), { code: status, signal, killed: child.killed });
    if (failure) Object.assign(failure, { stdout: output[0], stderr: output[1] });
    callback?.(failure ?? null, ...output);
  });
  child.stdin?.end();
  return child;
}
function exec(command, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  options ??= {};
  return execResult(spawn(command, [], { ...options, shell: options.shell ?? true }), options, callback);
}
function execFile(command, args, options, callback) {
  if (typeof args === "function") {
    callback = args; args = []; options = {};
  } else if (!Array.isArray(args)) {
    if (typeof options === "function") callback = options;
    options = args ?? {}; args = [];
  } else if (typeof options === "function") {
    callback = options; options = {};
  }
  options ??= {};
  return execResult(spawn(command, args, options), options, callback);
}
const janisChildProcess = {
  spawn,
  spawnSync,
  exec,
  execSync: (command, options = {}) => {
    const result = runChild(command, [], { ...options, shell: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `command exited ${result.status ?? result.signal}`);
    return options.encoding ? result.stdout : Buffer.from(result.stdout);
  },
  execFile,
  execFileSync: (command, args, options = {}) => {
    const result = spawnSync(command, args, options);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(String(result.stderr) || `command exited ${result.status ?? result.signal}`);
    return result.stdout;
  },
};

function rotateRight(value, count) {
  return value >>> count | value << 32 - count;
}

function sha256(input) {
  const bytes = Buffer.from(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = Buffer.alloc(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index++)
    padded[paddedLength - 1 - index] = Number(bitLength >> BigInt(index * 8) & 0xffn);

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      const at = offset + index * 4;
      words[index] = (padded[at] << 24 | padded[at + 1] << 16 |
        padded[at + 2] << 8 | padded[at + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index++) {
      const s0 = rotateRight(words[index - 15], 7) ^
        rotateRight(words[index - 15], 18) ^ words[index - 15] >>> 3;
      const s1 = rotateRight(words[index - 2], 17) ^
        rotateRight(words[index - 2], 19) ^ words[index - 2] >>> 10;
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = e & f ^ ~e & g;
      const first = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = a & b ^ a & c ^ b & c;
      const second = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + first) >>> 0;
      d = c; c = b; b = a; a = (first + second) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => {
      state[index] = (state[index] + value) >>> 0;
    });
  }
  const output = Buffer.alloc(32);
  state.forEach((value, index) => output.writeUInt32BE(value, index * 4));
  return output;
}

function md5(input) {
  const bytes = Buffer.from(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = Buffer.alloc(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index++)
    padded[paddedLength - 8 + index] = Number(bitLength >> BigInt(index * 8) & 0xffn);

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const words = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      const at = offset + index * 4;
      words[index] = (padded[at] | padded[at + 1] << 8 |
        padded[at + 2] << 16 | padded[at + 3] << 24) >>> 0;
    }
    let [a, b, c, d] = state;
    for (let index = 0; index < 64; index++) {
      let value;
      let word;
      if (index < 16) { value = b & c | ~b & d; word = index; }
      else if (index < 32) { value = d & b | ~d & c; word = (5 * index + 1) % 16; }
      else if (index < 48) { value = b ^ c ^ d; word = (3 * index + 5) % 16; }
      else { value = c ^ (b | ~d); word = 7 * index % 16; }
      const sum = (a + value + constants[index] + words[word]) >>> 0;
      const rotated = sum << shifts[index] | sum >>> 32 - shifts[index];
      a = d; d = c; c = b; b = (b + rotated) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
  }
  const output = Buffer.alloc(16);
  state.forEach((value, index) => output.writeUInt32LE(value, index * 4));
  return output;
}
function createHash(algorithm) {
  algorithm = String(algorithm).toLowerCase().replaceAll("-", "");
  if (algorithm !== "sha256" && algorithm !== "md5")
    throw new Error(`Janis does not implement hash '${algorithm}'`);
  const chunks = [];
  return {
    update(value, encoding) { chunks.push(Buffer.from(value, encoding)); return this; },
    digest(encoding) {
      const input = Buffer.concat(chunks);
      const bytes = algorithm === "sha256" ? sha256(input) : md5(input);
      return encoding ? bytes.toString(encoding) : bytes;
    },
    copy() { const copy = createHash(algorithm); copy.update(Buffer.concat(chunks)); return copy; },
  };
}
function createHmac(algorithm, key) {
  const blockSize = 64;
  let normalized = Buffer.from(key);
  if (normalized.length > blockSize)
    normalized = createHash(algorithm).update(normalized).digest();
  const padded = Buffer.alloc(blockSize);
  padded.set(normalized);
  const inner = Buffer.from(padded);
  const outer = Buffer.from(padded);
  for (let index = 0; index < blockSize; index++) {
    inner[index] ^= 0x36;
    outer[index] ^= 0x5c;
  }
  const chunks = [];
  return {
    update(value, encoding) { chunks.push(Buffer.from(value, encoding)); return this; },
    digest(encoding) {
      const inside = createHash(algorithm).update(inner)
        .update(Buffer.concat(chunks)).digest();
      const bytes = createHash(algorithm).update(outer).update(inside).digest();
      return encoding ? bytes.toString(encoding) : bytes;
    },
  };
}

// QuickJS exposes entropy helpers on the global crypto object but not Web
// Crypto's digest API. PKCE and similar upstream protocols only need this
// small, deterministic operation; keep it in-Wasm beside Janis's measured
// Node hash implementation instead of importing browser crypto authority.
crypto.subtle ??= {
  async digest(algorithm, data) {
    const name = String(
      typeof algorithm === "string" ? algorithm : algorithm?.name ?? "",
    ).toLowerCase().replaceAll("-", "");
    if (name !== "sha256") {
      throw new Error(`Janis Web Crypto does not implement digest '${name}'`);
    }
    const digest = sha256(Buffer.from(data));
    const output = new Uint8Array(digest.length);
    output.set(digest);
    return output.buffer;
  },
};
const janisCrypto = {
  randomBytes: (size, callback) => { const bytes = Buffer.from(Dolly.random(size)); if (callback) queueMicrotask(() => callback(null, bytes)); return bytes; },
  randomFillSync: (buffer, offset = 0, size = buffer.length - offset) => { buffer.set(Dolly.random(size), offset); return buffer; },
  randomUUID: crypto.randomUUID,
  createHash,
  createHmac,
  timingSafeEqual: (left, right) => {
    if (left.length !== right.length)
      throw new RangeError("Input buffers must have the same byte length");
    let difference = 0;
    for (let index = 0; index < left.length; index++)
      difference |= left[index] ^ right[index];
    return difference === 0;
  },
  webcrypto: crypto,
  subtle: crypto.subtle,
  constants: {},
};

const janisOs = {
  EOL: "\n",
  devNull: "/dev/null",
  homedir: () => process.env.HOME || "/home/dolly",
  tmpdir: () => process.env.TMPDIR || "/tmp",
  platform: () => "wasm",
  arch: () => "wasm64",
  type: () => "Dolly",
  release: () => "0",
  hostname: () => "dolly",
  userInfo: () => ({ username: "dolly", uid: 0, gid: 0, shell: "/bin/slop", homedir: process.env.HOME || "/home/dolly" }),
  cpus: () => [{ model: "WebAssembly", speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }],
  totalmem: () => 0,
  freemem: () => 0,
  endianness: () => "LE",
};

function formatValue(value) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
const janisUtil = {
  inspect: (value) => formatValue(value),
  format: (format, ...args) => {
    if (typeof format !== "string") return [format, ...args].map(formatValue).join(" ");
    let index = 0;
    const output = format.replace(/%[sdijoOf%]/g, (token) => {
      if (token === "%%") return "%";
      const value = args[index++];
      if (token === "%d" || token === "%i" || token === "%f") return String(Number(value));
      if (token === "%j") { try { return JSON.stringify(value); } catch { return "[Circular]"; } }
      return formatValue(value);
    });
    return [output, ...args.slice(index).map(formatValue)].join(" ");
  },
  promisify: (fn) => (...args) => new Promise((resolve, reject) => fn(...args, (error, value) => error ? reject(error) : resolve(value))),
  callbackify: (fn) => (...args) => { const callback = args.pop(); Promise.resolve(fn(...args)).then((value) => callback(null, value), callback); },
  inherits: (constructor, superConstructor) => { Object.setPrototypeOf(constructor.prototype, superConstructor.prototype); Object.setPrototypeOf(constructor, superConstructor); },
  types: { isUint8Array: (value) => value instanceof Uint8Array, isArrayBuffer: (value) => value instanceof ArrayBuffer, isDate: (value) => value instanceof Date },
  TextEncoder,
  TextDecoder,
  deprecate: (fn) => fn,
  debuglog: () => () => {},
  stripVTControlCharacters: (value) => String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ""),
};

const janisStream = {
  Stream: JanisEventEmitter,
  Readable: JanisReadable,
  Writable: JanisWritable,
  Duplex: JanisDuplex,
  Transform: JanisTransform,
  PassThrough: JanisPassThrough,
  pipeline: (...args) => { const callback = typeof args.at(-1) === "function" ? args.pop() : undefined; for (let index = 0; index + 1 < args.length; index++) args[index].pipe(args[index + 1]); callback?.(); return args.at(-1); },
  finished: (stream, callback) => { stream.once("end", () => callback?.()); stream.once("finish", () => callback?.()); return () => {}; },
};
const janisStreamPromises = {
  pipeline: async (...streams) => janisStream.pipeline(...streams),
  finished: async () => {},
};

function janisDiagnosticChannel(name) {
  return {
    name,
    hasSubscribers: false,
    publish() {},
    subscribe() {},
    unsubscribe() {},
    bindStore() {},
    unbindStore() {},
    runStores(_context, callback, thisArg, ...args) {
      return callback.apply(thisArg, args);
    },
  };
}
const janisDiagnosticsChannel = {
  channel: janisDiagnosticChannel,
  hasSubscribers: () => false,
  subscribe() {},
  unsubscribe() {},
  tracingChannel(name) {
    const tracing = {
      start: janisDiagnosticChannel(`${name}:start`),
      end: janisDiagnosticChannel(`${name}:end`),
      asyncStart: janisDiagnosticChannel(`${name}:asyncStart`),
      asyncEnd: janisDiagnosticChannel(`${name}:asyncEnd`),
      error: janisDiagnosticChannel(`${name}:error`),
      hasSubscribers: false,
      traceSync(callback, context, thisArg, ...args) {
        return callback.apply(thisArg, args);
      },
      tracePromise(callback, context, thisArg, ...args) {
        return Promise.resolve(callback.apply(thisArg, args));
      },
      traceCallback(callback, position, context, thisArg, ...args) {
        return callback.apply(thisArg, args);
      },
    };
    return tracing;
  },
};

const janisQuerystring = {
  stringify(value = {}) {
    const parameters = new URLSearchParams();
    for (const [name, item] of Object.entries(value)) {
      if (Array.isArray(item)) for (const entry of item) parameters.append(name, entry);
      else parameters.append(name, item ?? "");
    }
    return parameters.toString();
  },
  parse(value = "") {
    const result = Object.create(null);
    for (const [name, item] of new URLSearchParams(String(value))) {
      if (!(name in result)) result[name] = item;
      else if (Array.isArray(result[name])) result[name].push(item);
      else result[name] = [result[name], item];
    }
    return result;
  },
  escape: encodeURIComponent,
  unescape: decodeURIComponent,
};
janisQuerystring.encode = janisQuerystring.stringify;
janisQuerystring.decode = janisQuerystring.parse;

class JanisUndiciDispatcher extends JanisEventEmitter {
  close() { return Promise.resolve(); }
  destroy() { return Promise.resolve(); }
  dispatch() { throw new Error("Janis dispatches HTTP through global fetch"); }
}
class JanisUndiciAgent extends JanisUndiciDispatcher {}
let janisGlobalDispatcher = new JanisUndiciAgent();
const janisUndici = {
  Dispatcher: JanisUndiciDispatcher,
  Agent: JanisUndiciAgent,
  Client: JanisUndiciAgent,
  Pool: JanisUndiciAgent,
  ProxyAgent: JanisUndiciAgent,
  EnvHttpProxyAgent: JanisUndiciAgent,
  setGlobalDispatcher(dispatcher) { janisGlobalDispatcher = dispatcher; },
  getGlobalDispatcher() { return janisGlobalDispatcher; },
  // Pi calls install() to keep Node's global fetch and its dispatcher paired.
  // Janis fetch has no socket dispatcher: it already terminates at Dolly.http.
  install() {},
  fetch: (...args) => globalThis.fetch(...args),
  Headers,
  Response,
  FormData,
};

class JanisAsyncLocalStorage {
  #store;
  disable() { this.#store = undefined; }
  enterWith(store) { this.#store = store; }
  getStore() { return this.#store; }
  run(store, callback, ...args) {
    const previous = this.#store;
    this.#store = store;
    try { return callback(...args); } finally { this.#store = previous; }
  }
  exit(callback, ...args) { return this.run(undefined, callback, ...args); }
  static bind(callback) { return callback; }
  static snapshot() { return (callback, ...args) => callback(...args); }
}
class JanisAsyncResource {
  runInAsyncScope(callback, thisArg, ...args) { return callback.apply(thisArg, args); }
  emitDestroy() { return this; }
  asyncId() { return 1; }
  triggerAsyncId() { return 0; }
  static bind(callback) { return callback; }
}
const janisAsyncHooks = {
  AsyncLocalStorage: JanisAsyncLocalStorage,
  AsyncResource: JanisAsyncResource,
  createHook: () => ({ enable() { return this; }, disable() { return this; } }),
  executionAsyncId: () => 1,
  triggerAsyncId: () => 0,
  executionAsyncResource: () => ({}),
};

class JanisConsole {
  constructor(stdout = janisStdout, stderr = janisStderr) {
    this.stdout = stdout;
    this.stderr = stderr;
  }
  log(...values) { this.stdout.write(`${values.map(formatValue).join(" ")}\n`); }
  info(...values) { this.log(...values); }
  debug(...values) { this.log(...values); }
  warn(...values) { this.stderr.write(`${values.map(formatValue).join(" ")}\n`); }
  error(...values) { this.warn(...values); }
  dir(value) { this.log(value); }
  time() {}
  timeEnd() {}
  trace(...values) { this.error(...values); }
}

class JanisReadableStream {
  constructor(source = {}) {
    this.source = source;
    this.queue = [];
    this.done = false;
    this.waiters = [];
    const controller = {
      enqueue: (value) => { this.queue.push(value); this.#wake(); },
      close: () => { this.done = true; this.#wake(); },
      error: (error) => { this.error = error; this.done = true; this.#wake(); },
      desiredSize: 1,
    };
    this.controller = controller;
    source.start?.(controller);
  }
  #wake() { for (const wake of this.waiters.splice(0)) wake(); }
  getReader() {
    return {
      read: async () => {
        if (!this.queue.length && !this.done) {
          this.source.pull?.(this.controller);
          if (!this.queue.length && !this.done) {
            await new Promise((resolve) => this.waiters.push(resolve));
          }
        }
        if (this.error) throw this.error;
        return this.queue.length
          ? { value: this.queue.shift(), done: false }
          : { value: undefined, done: true };
      },
      cancel: async (reason) => this.cancel(reason),
      releaseLock() {},
    };
  }
  async cancel(reason) { this.done = true; await this.source.cancel?.(reason); this.#wake(); }
  async pipeTo(destination) {
    for await (const chunk of this) await destination.getWriter().write(chunk);
    await destination.getWriter().close();
  }
  [Symbol.asyncIterator]() {
    const reader = this.getReader();
    return { next: () => reader.read(), return: async () => { await reader.cancel(); return { done: true }; } };
  }
}
class JanisWritableStream {
  constructor(sink = {}) { this.sink = sink; }
  getWriter() {
    return {
      write: async (chunk) => this.sink.write?.(chunk),
      close: async () => this.sink.close?.(),
      abort: async (reason) => this.sink.abort?.(reason),
      ready: Promise.resolve(),
      closed: Promise.resolve(),
    };
  }
}
class JanisTransformStream {
  constructor() {
    const chunks = [];
    this.writable = new JanisWritableStream({ write: (chunk) => chunks.push(chunk) });
    this.readable = new JanisReadableStream({
      pull(controller) {
        if (chunks.length) controller.enqueue(chunks.shift());
      },
    });
  }
}
globalThis.ReadableStream ??= JanisReadableStream;
globalThis.WritableStream ??= JanisWritableStream;
globalThis.TransformStream ??= JanisTransformStream;
const janisStreamWeb = {
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
};

const janisVm = {
  runInThisContext: (source) => (0, eval)(String(source)),
  runInNewContext: (source, context = {}) => {
    const names = Object.keys(context);
    return Function(...names, String(source))(...names.map((name) => context[name]));
  },
  runInContext: (source, context) => janisVm.runInNewContext(source, context),
  createContext: (context = {}) => context,
  isContext: (context) => context !== null && typeof context === "object",
  compileFunction: (source, parameters = []) => Function(...parameters, String(source)),
};
janisVm.Script = class Script {
  constructor(source) { this.source = String(source); }
  runInThisContext() { return janisVm.runInThisContext(this.source); }
  runInContext(context) { return janisVm.runInContext(this.source, context); }
  runInNewContext(context) { return janisVm.runInNewContext(this.source, context); }
  createCachedData() { return Buffer.alloc(0); }
};

const janisV8 = {
  getCachedDataVersionTag: () => 0,
  getHeapStatistics: () => ({}),
  getHeapSpaceStatistics: () => [],
  setFlagsFromString() {},
  serialize: (value) => Buffer.from(JSON.stringify(value)),
  deserialize: (value) => JSON.parse(Buffer.from(value).toString()),
};

const janisDns = {
  lookup(_hostname, options, callback) {
    if (typeof options === "function") callback = options;
    queueMicrotask(() => callback?.(Object.assign(new Error("Janis has no DNS socket API"), { code: "ENOSYS" })));
  },
  promises: {
    lookup: async () => { throw Object.assign(new Error("Janis has no DNS socket API"), { code: "ENOSYS" }); },
  },
};

class JanisModule {
  constructor(id = "", parent = null) {
    this.id = String(id);
    this.filename = this.id;
    this.path = dirname(this.filename);
    this.exports = {};
    this.loaded = false;
    this.parent = parent;
    this.children = [];
    this.paths = JanisModule._nodeModulePaths(this.path);
    this.require = createJanisRequire(this.filename);
  }
  static _nodeModulePaths(from) {
    const paths = [];
    let directory = resolvePath(from);
    for (;;) {
      paths.push(janisPath.join(directory, "node_modules"));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    return paths;
  }
}

const janisBuiltinModuleNames = [
  "assert", "assert/strict", "async_hooks", "buffer", "child_process",
  "console", "constants", "crypto", "diagnostics_channel", "dns", "events",
  "fs", "fs/promises", "http", "http2", "https", "module", "net", "os",
  "path", "perf_hooks", "process", "querystring", "readline", "sqlite",
  "stream", "stream/promises", "stream/web", "string_decoder", "timers",
  "timers/promises", "tls", "tty", "url", "util", "util/types", "v8", "vm",
  "worker_threads", "zlib", "undici",
];

function janisModuleFile(candidate) {
  for (const path of [
    candidate,
    `${candidate}.js`,
    `${candidate}.mjs`,
    `${candidate}.cjs`,
    janisPath.join(candidate, "index.js"),
    janisPath.join(candidate, "index.mjs"),
  ]) {
    try {
      if (fsStat(path).isFile()) return path;
    }
    catch {}
  }
  return undefined;
}

function janisExportTarget(value, conditions) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const target = janisExportTarget(candidate, conditions);
      if (target !== undefined) return target;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const condition of conditions)
      if (Object.hasOwn(value, condition)) {
        const target = janisExportTarget(value[condition], conditions);
        if (target !== undefined) return target;
      }
  }
  return undefined;
}

function janisMappedTarget(map, key, conditions) {
  if (Object.hasOwn(map, key)) return janisExportTarget(map[key], conditions);
  let best;
  for (const pattern of Object.keys(map)) {
    const star = pattern.indexOf("*");
    if (star < 0 || pattern.indexOf("*", star + 1) >= 0) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!key.startsWith(prefix) || !key.endsWith(suffix) ||
        key.length < prefix.length + suffix.length) continue;
    const target = janisExportTarget(map[pattern], conditions);
    if (target === undefined || (best && prefix.length <= best.prefix.length)) continue;
    best = {
      prefix,
      match: key.slice(prefix.length, key.length - suffix.length),
      target,
    };
  }
  return best?.target?.replaceAll("*", () => best.match);
}

function janisPackageExport(exportsValue, subpath, conditions) {
  const key = subpath ? `./${subpath}` : ".";
  if (typeof exportsValue === "string" || Array.isArray(exportsValue))
    return subpath ? undefined : janisExportTarget(exportsValue, conditions);
  if (!exportsValue || typeof exportsValue !== "object") return undefined;
  if (!Object.keys(exportsValue).some((entry) => entry.startsWith(".")))
    return subpath ? undefined : janisExportTarget(exportsValue, conditions);
  return janisMappedTarget(exportsValue, key, conditions);
}

function janisPackageImport(specifier, baseName, forRequire = false, raw = false) {
  if (specifier === "#" || specifier.startsWith("#/")) {
    throw Object.assign(new Error(`Invalid package import specifier '${specifier}'`), {
      code: "ERR_INVALID_MODULE_SPECIFIER",
    });
  }
  let directory = String(baseName).startsWith("/") ? dirname(baseName) : Dolly.cwd();
  for (;;) {
    const manifestPath = janisPath.join(directory, "package.json");
    if (fsExists(manifestPath)) {
      let manifest;
      try { manifest = JSON.parse(fsRead(manifestPath, "utf8")); }
      catch (error) {
        throw Object.assign(new Error(`Invalid package manifest '${manifestPath}': ${error.message}`), {
          code: "ERR_INVALID_PACKAGE_CONFIG",
        });
      }
      const conditions = forRequire
        ? ["require", "default", "node"]
        : ["import", "default", "node"];
      const target = manifest.imports && typeof manifest.imports === "object"
        ? janisMappedTarget(manifest.imports, specifier, conditions)
        : undefined;
      if (target === undefined) {
        throw Object.assign(new Error(`Package import '${specifier}' is not defined by '${manifestPath}'`), {
          code: "ERR_PACKAGE_IMPORT_NOT_DEFINED",
        });
      }
      if (!target.startsWith("./"))
        return janisResolveModule(target, manifestPath, forRequire, raw);
      const candidate = normalizePath(directory, target);
      if (candidate !== directory && !candidate.startsWith(`${directory}/`)) {
        throw Object.assign(new Error(`Package import '${specifier}' escapes its package root`), {
          code: "ERR_INVALID_PACKAGE_TARGET",
        });
      }
      const resolved = janisModuleFile(candidate);
      if (resolved !== undefined)
        return forRequire || raw ? resolved : janisModuleForImport(resolved);
      throw Object.assign(new Error(`Cannot find package import '${specifier}'`), {
        code: "ERR_MODULE_NOT_FOUND",
      });
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw Object.assign(new Error(`Package import '${specifier}' has no package scope`), {
    code: "ERR_PACKAGE_IMPORT_NOT_DEFINED",
  });
}

// Module adapters must exist as files because QuickJS's module loader consumes
// filesystem paths. Keep them in one invocation-owned scratch tree; the native
// runner calls __janisCleanup before destroying this JavaScript context.
const janisTemporaryRoot = `/tmp/janis-${process.pid}-${Math.random().toString(16).slice(2, 14)}`;

function janisEsmBuiltin(specifier) {
  const name = String(specifier).replace(/^node:/, "");
  const builtin = globalThis.__janisBuiltin(name);
  const directory = `${janisTemporaryRoot}/esm-builtins`;
  const path = `${directory}/${name.replaceAll("/", "__")}.mjs`;
  const exports = Object.keys(builtin)
    .filter((key) => key !== "default" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key))
    .sort();
  const source = [
    `const builtin = globalThis.__janisBuiltin(${JSON.stringify(name)});`,
    "export default builtin;",
    ...exports.map((key) => `export const ${key} = builtin[${JSON.stringify(key)}];`),
    "",
  ].join("\n");
  fsMkdir(directory, { recursive: true });
  if (!fsExists(path) || fsRead(path, "utf8") !== source) fsWrite(path, source);
  return path;
}

function janisModuleIsEsm(path, fallback = false) {
  if (path.endsWith(".mjs")) return true;
  if (path.endsWith(".cjs")) return false;
  let directory = dirname(path);
  for (;;) {
    const manifestPath = janisPath.join(directory, "package.json");
    if (fsExists(manifestPath)) {
      try { return JSON.parse(fsRead(manifestPath, "utf8")).type === "module"; }
      catch (error) {
        throw Object.assign(new Error(`Invalid package manifest '${manifestPath}': ${error.message}`), {
          code: "ERR_INVALID_PACKAGE_CONFIG",
        });
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return fallback;
    directory = parent;
  }
}

function janisEsmCommonJs(modulePath) {
  const value = globalThis.__janisRequireCjs(modulePath);
  const directory = `${janisTemporaryRoot}/esm-commonjs`;
  const digest = createHash("sha256").update(modulePath).digest("hex");
  const path = `${directory}/${digest}.mjs`;
  const exports = value !== null && (typeof value === "object" || typeof value === "function")
    ? Object.keys(value)
      .filter((key) => key !== "default" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key))
      .sort()
    : [];
  const source = [
    `const value = globalThis.__janisRequireCjs(${JSON.stringify(modulePath)});`,
    "export default value;",
    ...exports.map((key) => `export const ${key} = value[${JSON.stringify(key)}];`),
    "",
  ].join("\n");
  fsMkdir(directory, { recursive: true });
  if (!fsExists(path) || fsRead(path, "utf8") !== source) fsWrite(path, source);
  return path;
}

function janisModuleForImport(path) {
  return janisModuleIsEsm(path, true) ? path : janisEsmCommonJs(path);
}

function janisResolveModule(specifier, baseName, forRequire = false, raw = false) {
  specifier = String(specifier);
  if (specifier.startsWith("#"))
    return janisPackageImport(specifier, baseName, forRequire, raw);
  if (specifier.startsWith("node:") ||
      janisBuiltinModuleNames.includes(specifier)) {
    return janisEsmBuiltin(specifier);
  }
  const parts = specifier.split("/");
  const packageParts = specifier.startsWith("@") ? 2 : 1;
  if (parts.length < packageParts || parts.slice(0, packageParts).some((part) =>
    !part || part === "." || part === ".." || part.includes("\\"))) {
    throw Object.assign(new Error(`Invalid bare module specifier '${specifier}'`), {
      code: "ERR_INVALID_MODULE_SPECIFIER",
    });
  }
  const packageName = parts.slice(0, packageParts).join("/");
  const subpath = parts.slice(packageParts).join("/");
  if (subpath.split("/").some((part) => part === "." || part === ".." || part.includes("\\"))) {
    throw Object.assign(new Error(`Invalid bare module specifier '${specifier}'`), {
      code: "ERR_INVALID_MODULE_SPECIFIER",
    });
  }

  let directory = String(baseName).startsWith("/")
    ? dirname(baseName)
    : Dolly.cwd();
  const roots = [];
  for (;;) {
    roots.push(janisPath.join(directory, "node_modules"));
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  roots.push("/usr/lib/node_modules");

  for (const root of roots) {
    const packageRoot = janisPath.join(root, packageName);
    const manifestPath = janisPath.join(packageRoot, "package.json");
    if (!fsExists(manifestPath)) continue;
    let manifest;
    try { manifest = JSON.parse(fsRead(manifestPath, "utf8")); }
    catch (error) {
      throw Object.assign(new Error(`Invalid package manifest '${manifestPath}': ${error.message}`), {
        code: "ERR_INVALID_PACKAGE_CONFIG",
      });
    }

    let target;
    if (manifest.exports !== undefined) {
      const conditions = forRequire
        ? ["require", "default", "node"]
        : ["import", "default", "node"];
      target = janisPackageExport(manifest.exports, subpath, conditions);
      if (target === undefined) {
        throw Object.assign(new Error(`Package '${packageName}' does not export './${subpath}'`), {
          code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
        });
      }
    } else if (subpath) target = `./${subpath}`;
    else {
      target = manifest.module ?? manifest.main ?? "./index.js";
      if (typeof target === "string" && !target.startsWith(".") && !target.startsWith("/"))
        target = `./${target}`;
    }
    if (typeof target !== "string" || !target.startsWith("./")) {
      throw Object.assign(new Error(`Package '${packageName}' has an unsupported export target`), {
        code: "ERR_INVALID_PACKAGE_TARGET",
      });
    }
    const candidate = normalizePath(packageRoot, target);
    if (candidate !== packageRoot && !candidate.startsWith(`${packageRoot}/`)) {
      throw Object.assign(new Error(`Package '${packageName}' export escapes its package root`), {
        code: "ERR_INVALID_PACKAGE_TARGET",
      });
    }
    const resolved = janisModuleFile(candidate);
    if (resolved !== undefined)
      return forRequire || raw ? resolved : janisModuleForImport(resolved);
    throw Object.assign(new Error(`Cannot find exported module '${specifier}'`), {
      code: "ERR_MODULE_NOT_FOUND",
    });
  }
  throw Object.assign(new Error(`Cannot find package '${packageName}' from '${baseName}'`), {
    code: "ERR_MODULE_NOT_FOUND",
  });
}
globalThis.__janisResolveModule = janisResolveModule;

const janisRequireCache = Object.create(null);
function createJanisRequire(filename = "/usr/lib/janis/index.js") {
  const base = dirname(filename);
  const require = (specifier) => {
    const name = String(specifier).replace(/^node:/, "");
    if (janisBuiltinModuleNames.includes(name)) return globalThis.__janisBuiltin(name);
    const resolved = require.resolve(String(specifier));
    if (resolved.endsWith(".json")) return JSON.parse(fsRead(resolved, "utf8"));
    if (janisModuleIsEsm(resolved)) {
      throw Object.assign(new Error(`Cannot require ES module '${resolved}'`), {
        code: "ERR_REQUIRE_ESM",
      });
    }
    const cached = janisRequireCache[resolved];
    if (cached) return cached.exports;
    const child = new JanisModule(resolved);
    janisRequireCache[resolved] = child;
    try {
      let source = fsRead(resolved, "utf8");
      if (source.startsWith("#!")) source = source.replace(/^#![^\n]*(?:\n|$)/, "");
      const wrapper = Function(
        "exports", "require", "module", "__filename", "__dirname",
        `${source}\n//# sourceURL=${resolved}`,
      );
      wrapper(child.exports, child.require, child, resolved, dirname(resolved));
      child.loaded = true;
      return child.exports;
    }
    catch (error) {
      delete janisRequireCache[resolved];
      throw error;
    }
  };
  require.resolve = (specifier) => {
    const value = String(specifier);
    const name = value.replace(/^node:/, "");
    if (janisBuiltinModuleNames.includes(name)) return value.startsWith("node:") ? value : name;
    if (!value.startsWith("/") && !value.startsWith("./") && !value.startsWith("../"))
      return janisResolveModule(value, filename, true);
    const candidate = value.startsWith("/") ? normalizePath(value) : resolvePath(base, value);
    for (const path of [candidate, `${candidate}.js`, `${candidate}.cjs`, `${candidate}.json`, janisPath.join(candidate, "index.js")]) {
      if (fsExists(path)) return path;
    }
    throw Object.assign(new Error(`Cannot find module '${specifier}'`), {
      code: "MODULE_NOT_FOUND",
    });
  };
  require.resolve.paths = (specifier) =>
    janisBuiltinModuleNames.includes(String(specifier).replace(/^node:/, ""))
      ? null
      : JanisModule._nodeModulePaths(base);
  require.cache = janisRequireCache;
  require.extensions = { ".js": true, ".json": true };
  require.main = undefined;
  return require;
}
globalThis.__janisRequireCjs = (path) => createJanisRequire(String(path))(String(path));
globalThis.__janisResolveFile = (path) => janisModuleForImport(String(path));
globalThis.__janisImportMetaResolve = (specifier, baseName) => {
  specifier = String(specifier);
  if (specifier.startsWith("node:")) return specifier;
  if (janisBuiltinModuleNames.includes(specifier)) return `node:${specifier}`;
  if (specifier.startsWith("file:")) return new URL(specifier).href;
  if (specifier.startsWith("/")) return `file://${normalizePath(specifier)}`;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return `file://${normalizePath(dirname(String(baseName)), specifier)}`;
  }
  return `file://${janisResolveModule(specifier, baseName, false, true)}`;
};

const janisTls = {
  connect: () => { throw new Error("Janis has no TLS sockets; use fetch"); },
  createSecureContext: () => ({}),
  checkServerIdentity: () => undefined,
  rootCertificates: [],
  TLSSocket: class TLSSocket extends JanisEventEmitter {},
};

const janisBuiltinModules = {
  "assert/strict": undefined,
  async_hooks: janisAsyncHooks,
  assert: Object.assign((condition, message) => { if (!condition) throw new Error(message || "Assertion failed"); }, { strictEqual: (a, b) => { if (a !== b) throw new Error("Expected values to be strictly equal"); } }),
  buffer: { Buffer, SlowBuffer: Buffer, INSPECT_MAX_BYTES: 50, constants: {} },
  child_process: janisChildProcess,
  console: { Console: JanisConsole, ...console },
  constants: janisFs.constants,
  crypto: janisCrypto,
  diagnostics_channel: janisDiagnosticsChannel,
  dns: janisDns,
  events: Object.assign(JanisEventEmitter, { EventEmitter: JanisEventEmitter, once: JanisEventEmitter.once }),
  fs: janisFs,
  "fs/promises": janisFsPromises,
  module: {
    Module: JanisModule,
    createRequire: (filename) => createJanisRequire(
      filename instanceof URL ? decodeURIComponent(filename.pathname) : String(filename),
    ),
    builtinModules: [...janisBuiltinModuleNames, ...janisBuiltinModuleNames.map((name) => `node:${name}`)],
    isBuiltin: (name) => Boolean(janisBuiltinModules[String(name).replace(/^node:/, "")]),
  },
  os: janisOs,
  path: janisPath,
  perf_hooks: { performance },
  process,
  querystring: janisQuerystring,
  readline: {
    createInterface: (options, output) => new JanisReadline(options, output),
    emitKeypressEvents() {},
    clearLine: () => true,
    cursorTo: () => true,
    moveCursor: () => true,
  },
  stream: janisStream,
  "stream/promises": janisStreamPromises,
  "stream/web": janisStreamWeb,
  string_decoder: { StringDecoder: JanisStringDecoder },
  "timers/promises": { setTimeout: timerPromise, setImmediate: (value) => Promise.resolve(value) },
  timers: { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate },
  tls: janisTls,
  tty: { isatty: (fd) => Boolean(Dolly.isatty(Number(fd))), ReadStream: JanisStdin, WriteStream: JanisOutput },
  undici: janisUndici,
  url: {
    URL,
    URLSearchParams,
    pathToFileURL: (path) => new URL(`file://${resolvePath(path)}`),
    fileURLToPath: (url) => decodeURIComponent((url instanceof URL ? url : new URL(url)).pathname),
    domainToASCII: (value) => String(value),
    domainToUnicode: (value) => String(value),
    format: (url) => String(url),
    parse: (value) => new URL(value),
  },
  util: janisUtil,
  "util/types": janisUtil.types,
  v8: janisV8,
  vm: janisVm,
  worker_threads: { isMainThread: true, parentPort: null, threadId: 0, workerData: null, Worker: class { constructor() { throw new Error("Janis has no worker threads"); } } },
};

janisBuiltinModules["assert/strict"] = janisBuiltinModules.assert;
janisBuiltinModules.http2 = {
  constants: {},
  connect: () => { throw new Error("Janis has no HTTP/2 sockets; use fetch"); },
};
janisBuiltinModules.sqlite = {
  DatabaseSync: class DatabaseSync {
    constructor() { throw new Error("Janis does not provide SQLite yet"); }
  },
};

function unavailableZlib() {
  const error = new Error("Janis does not provide Node zlib bindings yet");
  error.code = "ERR_METHOD_NOT_IMPLEMENTED";
  throw error;
}

for (const name of ["http", "https", "net"]) {
  class SocketLike extends JanisEventEmitter { setTimeout() { return this; } setNoDelay() { return this; } destroy() { this.emit("close"); } }
  class ServerLike extends JanisEventEmitter {
    listening = false;
    listen() {
      // Node reports bind failures asynchronously. Keeping that shape lets
      // applications such as Pi fall back to a displayed/manual OAuth code
      // without pretending Dolly can open a host or browser socket.
      queueMicrotask(() => {
        const error = Object.assign(
          new Error("Janis has no listening socket API"),
          { code: "ENOSYS", syscall: "listen" },
        );
        this.emit("error", error);
      });
      return this;
    }
    address() { return null; }
    close(callback) {
      this.listening = false;
      queueMicrotask(() => {
        callback?.();
        this.emit("close");
      });
      return this;
    }
  }
  janisBuiltinModules[name] = {
    Agent: class extends JanisEventEmitter { destroy() {} },
    ClientRequest: SocketLike,
    IncomingMessage: JanisReadable,
    Server: ServerLike,
    createServer: (listener) => {
      const server = new ServerLike();
      if (typeof listener === "function") server.on("request", listener);
      return server;
    },
    Socket: SocketLike,
    request: () => { throw new Error("Janis has no sockets; use fetch"); },
    get: () => { throw new Error("Janis has no sockets; use fetch"); },
    isIP: () => 0,
    isIPv4: () => false,
    isIPv6: () => false,
    METHODS: [],
    STATUS_CODES: {},
  };
}
janisBuiltinModules.zlib = {
  constants: {},
  codes: {},
  gzipSync: unavailableZlib,
  gunzipSync: unavailableZlib,
  deflateSync: unavailableZlib,
  inflateSync: unavailableZlib,
  createGunzip: unavailableZlib,
  createGzip: unavailableZlib,
  createInflate: unavailableZlib,
  createDeflate: unavailableZlib,
};

globalThis.__janisBuiltin = (name) => {
  name = String(name).replace(/^node:/, "");
  const module = janisBuiltinModules[name];
  if (module === undefined) throw new Error(`Janis does not provide module '${name}'`);
  return module;
};
// Node returns undefined for names that are not built in. Keep the strict
// throwing lookup for statically bundled imports, but expose Node's probing
// behavior through process.getBuiltinModule().
process.getBuiltinModule = (name) =>
  janisBuiltinModules[String(name).replace(/^node:/, "")];

if (typeof globalThis.DOMException !== "function") {
  globalThis.DOMException = class DOMException extends Error {
    constructor(message = "", name = "Error") { super(message); this.name = name; }
  };
}
if (typeof globalThis.Event !== "function") {
  globalThis.Event = class Event { constructor(type) { this.type = type; } };
}
if (typeof globalThis.EventTarget !== "function") {
  globalThis.EventTarget = class EventTarget {
    #events = new JanisEventEmitter();
    addEventListener(name, listener) { this.#events.on(name, listener); }
    removeEventListener(name, listener) { this.#events.off(name, listener); }
    dispatchEvent(event) { return this.#events.emit(event.type, event); }
  };
}

function janisStreamPump() {
  runDueTimers();
  return pumpChildren();
}
globalThis.__janisStreamPump = janisStreamPump;
function janisShellStream(command, stdout, stderr, timeout, options = {}) {
  const result = collectChild("/bin/slop", ["-c", command], { ...options, timeout }, stdout, stderr);
  if (result.error) throw result.error;
  return { status: result.status ?? 128 + childSignals[result.signal] };
}
globalThis.__janisShellStream = janisShellStream;

// Called by quickjs-main.c after draining each microtask batch. It blocks only
// inside the Wasm worker and keeps the runtime alive exactly while referenced
// timers or resumed stdin listeners exist.
globalThis.__janisPump = () => {
  if (janisStreamPump()) return true;
  const pumpedHttp = Boolean(globalThis.__dollyHttpPump?.());
  const referenced = [...janisTimers.values()].filter((timer) => timer.ref);
  const wantsInput = janisStdin.isActive();
  const activeChildren = [...janisChildren.values()].some(record => record.ref);
  if (!wantsInput && referenced.length === 0 && !pumpedHttp && !activeChildren) return false;
  const nextDue = referenced.length
    ? Math.max(0, Math.min(...referenced.map((timer) => timer.due)) - Date.now())
    : 1000;
  // The worker has one deliberately synchronous event pump. A short timed
  // input wait yields to the browser broker while an HTTP request is active;
  // this preserves timer-driven TUI animation and consumes response chunks as
  // they arrive without adding threads or host async authority.
  const wait = Math.min(pumpedHttp || activeChildren ? 10 : 1000, nextDue);
  let bytes = new Uint8Array(0);
  if (!wantsInput) Dolly.fsPoll([], wait);
  else if (!janisStdin.isTTY) {
    if (Dolly.fsPoll([[0, Dolly.fsConstants.POLLIN]], wait)[0]) bytes = Dolly.readStdin(4096);
    else { janisStreamPump(); return true; }
  } else bytes = Dolly.readRaw(wait);
  const size = Dolly.terminalSize();
  if (size.columns !== janisTerminalSize.columns || size.rows !== janisTerminalSize.rows) {
    janisTerminalSize = size;
    janisStdout.emit("resize");
  }
  janisStdin.publish(bytes);
  if (wantsInput && !janisStdin.isTTY && bytes.length === 0) janisStdin.finish();
  janisStreamPump();
  globalThis.__dollyHttpPump?.();
  return true;
};

globalThis.__janisCleanup = () => {
  for (const record of janisChildren.values()) {
    record.child.kill("SIGKILL");
    if (!record.waited) Dolly.processWait(record.child.pid);
    clearTimeout(record.timer);
    record.signal?.removeEventListener("abort", record.abort);
    for (let index = 0; index < 3; ++index) closeChildFd(record, index);
  }
  janisChildren.clear();
  fsRemove(janisTemporaryRoot, { recursive: true, force: true });
};
