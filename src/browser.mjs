import {
  consumeDollyHttpPolicy,
  isDollyCredentialHeader,
} from "./http-policy.mjs";
import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";

const mount = document.querySelector("#terminal");
const canvas = document.querySelector("#display");
const keyboard = document.querySelector("#keyboard");
const bootstrapLog = document.querySelector("#bootstrap-log");
const phoneMenuButton = document.querySelector("#phone-menu-button");
const phoneMenu = document.querySelector("#phone-menu");
bootstrapLog.replaceChildren();

const defaultFontSizeMilli = 15000;
const bootstrapMaximumLines = 40;
const bootstrapMaximumCharacters = 8192;
const bootstrapLines = [];
let bootstrapCharacters = 0;
let bootstrapFragment = "";

const encoder = new TextEncoder();
const textDecoder = new TextDecoder();
const bootstrapDecoder = new TextDecoder();
const commandResults = [];

let runtimeWorker;
let transport;
let networkTransport;
let presenter;
let resizeObserver;
let runtimeReady = false;
let builtSystemSnapshot = null;
let networkRequestChain = Promise.resolve();
const maximumDownloadBytes = 64 * 1024 * 1024;
let downloadCount = 0;

function startBrowserDownload(message) {
  if (typeof message.name !== "string" || message.name.length === 0 ||
      message.name.length > 255 || /[\/\\\u0000-\u001f\u007f]/u.test(message.name) ||
      message.name === "." || message.name === ".." ||
      !(message.bytes instanceof ArrayBuffer) ||
      message.bytes.byteLength > maximumDownloadBytes) {
    throw new Error("Dolly supplied an invalid download request");
  }
  const url = URL.createObjectURL(new Blob(
    [message.bytes],
    { type: "application/octet-stream" },
  ));
  const link = document.createElement("a");
  link.hidden = true;
  link.href = url;
  link.download = message.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  downloadCount++;
  document.documentElement.dataset.downloadCount = String(downloadCount);
  document.documentElement.dataset.downloadName = message.name;
}

function updatePhoneMode() {
  const narrow = matchMedia("(max-width: 960px)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  document.documentElement.dataset.phone = narrow && coarse ? "on" : "off";
}

updatePhoneMode();
addEventListener("resize", updatePhoneMode);

function closePhoneMenu() {
  phoneMenu.dataset.open = "false";
  phoneMenuButton.setAttribute("aria-expanded", "false");
}

phoneMenuButton.addEventListener("click", () => {
  const open = phoneMenu.dataset.open !== "true";
  phoneMenu.dataset.open = String(open);
  phoneMenuButton.setAttribute("aria-expanded", String(open));
});

for (const button of phoneMenu.querySelectorAll("[data-dolly-input]")) {
  button.addEventListener("click", () => {
    const input = button.dataset.dollyInput.replaceAll("\\r", "\r");
    if (transport && !transport.pushText(input)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
    closePhoneMenu();
    keyboard.focus({ preventScroll: true });
  });
}

function displayFatal(message) {
  canvas.hidden = true;
  bootstrapLog.hidden = false;
  appendBootstrap(`\nFATAL\n${message}\n`);
  document.documentElement.dataset.dollyStatus = "failed";
}

class DisplayTransport {
  static headerSize = 128;
  static eventRead = 0;
  static eventWrite = 1;
  static eventWake = 2;
  static eventDropped = 3;
  static resultSequence = 4;
  static resultStatus = 5;
  static foregroundPid = 6;
  static flags = 7;
  static frameSequence = 8;
  static frameIndex = 9;
  static frameWidth = 10;
  static frameHeight = 11;
  static frameStride = 12;
  static terminalCols = 13;
  static terminalRows = 14;
  static fontSizeMilli = 15;
  static pasteSequence = 16;
  static pasteConsumedSequence = 17;
  static pasteLength = 18;
  static copySequence = 19;
  static copyLength = 20;
  static copyFlags = 21;
  static cursorCol = 22;
  static cursorRow = 23;
  static cellWidth = 24;
  static cellHeight = 25;
  static paddingX = 26;
  static paddingY = 27;
  static interruptSequence = 28;
  static interruptTargetPid = 29;

  static keyEvent = 1;
  static textEvent = 2;
  static resizeEvent = 3;
  static focusEvent = 4;
  static pasteEvent = 5;
  static pointerEvent = 6;
  static scrollEvent = 7;

  static copyAvailable = 1;
  static copyTruncated = 2;

  constructor(buffer, address, eventSize, eventCapacity,
              pasteAddress, copyAddress, clipboardCapacity) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error("Dolly display transport requires shared Wasm memory");
    }
    if (address % 4 !== 0 || eventSize !== 128 ||
        (eventCapacity & (eventCapacity - 1)) !== 0 ||
        clipboardCapacity <= 0 || pasteAddress <= 0 || copyAddress <= 0 ||
        pasteAddress + clipboardCapacity > buffer.byteLength ||
        copyAddress + clipboardCapacity > buffer.byteLength) {
      throw new Error("Dolly supplied an invalid display mailbox");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.word = address / 4;
    this.eventSize = eventSize;
    this.eventCapacity = eventCapacity;
    this.pasteAddress = pasteAddress;
    this.copyAddress = copyAddress;
    this.clipboardCapacity = clipboardCapacity;
  }

  pushRecord({
    type,
    action = 0,
    modifiers = 0,
    flags = 0,
    width = 0,
    height = 0,
    scaleMilli = 0,
    fontSizeMilli = 0,
    key = "",
    code = "",
    text = "",
  }) {
    const keyBytes = encoder.encode(key);
    const codeBytes = encoder.encode(code);
    const textBytes = encoder.encode(text);
    if (keyBytes.length + codeBytes.length + textBytes.length > 88) return false;
    const read = Atomics.load(this.words, this.word + DisplayTransport.eventRead) >>> 0;
    const write = Atomics.load(this.words, this.word + DisplayTransport.eventWrite) >>> 0;
    if (((write - read) >>> 0) >= this.eventCapacity) {
      Atomics.add(this.words, this.word + DisplayTransport.eventDropped, 1);
      return false;
    }

    const offset = this.address + DisplayTransport.headerSize +
      (write & (this.eventCapacity - 1)) * this.eventSize;
    const view = new DataView(this.bytes.buffer, offset, this.eventSize);
    view.setUint32(0, type, true);
    view.setUint32(4, action, true);
    view.setUint32(8, modifiers, true);
    view.setUint32(12, flags, true);
    view.setUint32(16, width, true);
    view.setUint32(20, height, true);
    view.setUint32(24, scaleMilli, true);
    view.setUint32(28, fontSizeMilli, true);
    view.setUint16(32, keyBytes.length, true);
    view.setUint16(34, codeBytes.length, true);
    view.setUint16(36, textBytes.length, true);
    view.setUint16(38, 0, true);
    this.bytes.fill(0, offset + 40, offset + this.eventSize);
    this.bytes.set(keyBytes, offset + 40);
    this.bytes.set(codeBytes, offset + 40 + keyBytes.length);
    this.bytes.set(textBytes, offset + 40 + keyBytes.length + codeBytes.length);

    Atomics.store(this.words, this.word + DisplayTransport.eventWrite, (write + 1) | 0);
    Atomics.add(this.words, this.word + DisplayTransport.eventWake, 1);
    Atomics.notify(this.words, this.word + DisplayTransport.eventWake);
    return true;
  }

  pushKey(event) {
    let modifiers = 0;
    if (event.shiftKey) modifiers |= 1;
    if (event.ctrlKey) modifiers |= 2;
    if (event.altKey) modifiers |= 4;
    if (event.metaKey) modifiers |= 8;
    if (event.getModifierState?.("CapsLock")) modifiers |= 16;
    if (event.getModifierState?.("NumLock")) modifiers |= 32;
    return this.pushRecord({
      type: DisplayTransport.keyEvent,
      action: event.type === "keyup" ? 0 : event.repeat ? 2 : 1,
      modifiers,
      flags: event.isComposing ? 1 : 0,
      key: event.key,
      code: event.code,
    });
  }

  pushSyntheticKey(key, code, modifiers = 0, action = 1) {
    return this.pushRecord({
      type: DisplayTransport.keyEvent,
      action,
      modifiers,
      key,
      code,
    });
  }

  pushText(text) {
    const bytes = encoder.encode(text);
    let offset = 0;
    while (offset < bytes.length) {
      let end = Math.min(offset + 88, bytes.length);
      while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
      if (end === offset) return false;
      const chunk = textDecoder.decode(bytes.subarray(offset, end));
      if (!this.pushRecord({ type: DisplayTransport.textEvent, text: chunk })) return false;
      offset = end;
    }
    return true;
  }

  pushPaste(text) {
    const bytes = encoder.encode(text);
    if (bytes.length > this.clipboardCapacity) return false;
    const published = Atomics.load(
      this.words,
      this.word + DisplayTransport.pasteSequence,
    ) >>> 0;
    const consumed = Atomics.load(
      this.words,
      this.word + DisplayTransport.pasteConsumedSequence,
    ) >>> 0;
    if (published !== consumed) return false;

    // This page is the sole event producer. If the ring has room now, no
    // other producer can consume it between publishing the bytes and record.
    const read = Atomics.load(this.words, this.word + DisplayTransport.eventRead) >>> 0;
    const write = Atomics.load(this.words, this.word + DisplayTransport.eventWrite) >>> 0;
    if (((write - read) >>> 0) >= this.eventCapacity) return false;
    this.bytes.set(bytes, this.pasteAddress);
    Atomics.store(this.words, this.word + DisplayTransport.pasteLength, bytes.length);
    Atomics.store(
      this.words,
      this.word + DisplayTransport.pasteSequence,
      (published + 1) | 0,
    );
    return this.pushRecord({ type: DisplayTransport.pasteEvent });
  }

  pushPointer(x, y, action, event) {
    let modifiers = 0;
    if (event.shiftKey) modifiers |= 1;
    if (event.ctrlKey) modifiers |= 2;
    if (event.altKey) modifiers |= 4;
    if (event.metaKey) modifiers |= 8;
    return this.pushRecord({
      type: DisplayTransport.pointerEvent,
      action,
      modifiers,
      width: Math.max(0, Math.round(x)),
      height: Math.max(0, Math.round(y)),
    });
  }

  pushScroll(deltaRows) {
    const deltaMilli = Math.max(
      -2_000_000_000,
      Math.min(2_000_000_000, Math.round(deltaRows * 1000)),
    );
    if (deltaMilli === 0) return true;
    return this.pushRecord({
      type: DisplayTransport.scrollEvent,
      action: deltaMilli,
    });
  }

  copySelection() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = Atomics.load(
        this.words,
        this.word + DisplayTransport.copySequence,
      ) >>> 0;
      const flags = Atomics.load(
        this.words,
        this.word + DisplayTransport.copyFlags,
      ) >>> 0;
      const length = Atomics.load(
        this.words,
        this.word + DisplayTransport.copyLength,
      ) >>> 0;
      if ((flags & DisplayTransport.copyAvailable) === 0) return null;
      if ((flags & DisplayTransport.copyTruncated) !== 0 ||
          length > this.clipboardCapacity) {
        throw new Error("Dolly selection exceeds the clipboard bridge capacity");
      }
      const bytes = new Uint8Array(
        new Uint8Array(this.bytes.buffer, this.copyAddress, length),
      );
      const after = Atomics.load(
        this.words,
        this.word + DisplayTransport.copySequence,
      ) >>> 0;
      if (before === after) return textDecoder.decode(bytes);
    }
    throw new Error("Dolly selection changed while copying");
  }

  pushResize(width, height, devicePixelRatio) {
    const currentFont = Atomics.load(
      this.words,
      this.word + DisplayTransport.fontSizeMilli,
    ) >>> 0;
    return this.pushRecord({
      type: DisplayTransport.resizeEvent,
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      scaleMilli: Math.max(500, Math.min(4000, Math.round(devicePixelRatio * 1000))),
      fontSizeMilli: currentFont || defaultFontSizeMilli,
    });
  }

  currentResultSequence() {
    return Atomics.load(this.words, this.word + DisplayTransport.resultSequence);
  }

  async waitForResult(sequence) {
    const index = this.word + DisplayTransport.resultSequence;
    while (Atomics.load(this.words, index) === sequence) {
      const waiting = Atomics.waitAsync(this.words, index, sequence);
      if (waiting.async) await waiting.value;
    }
    return Atomics.load(this.words, this.word + DisplayTransport.resultStatus);
  }

  foregroundPid() {
    return Atomics.load(this.words, this.word + DisplayTransport.foregroundPid);
  }

  foregroundInterruptible() {
    return (Atomics.load(this.words, this.word + DisplayTransport.flags) & 1) !== 0;
  }

  inputIdle() {
    return Atomics.load(this.words, this.word + DisplayTransport.eventRead) ===
      Atomics.load(this.words, this.word + DisplayTransport.eventWrite);
  }

  graphicsActive() {
    return (Atomics.load(this.words, this.word + DisplayTransport.flags) & 2) !== 0;
  }

  interruptForeground() {
    const pid = this.foregroundPid();
    if (pid <= 0 || !this.foregroundInterruptible()) return false;
    Atomics.store(
      this.words,
      this.word + DisplayTransport.interruptTargetPid,
      pid,
    );
    Atomics.add(this.words, this.word + DisplayTransport.interruptSequence, 1);
    Atomics.add(this.words, this.word + DisplayTransport.eventWake, 1);
    Atomics.notify(this.words, this.word + DisplayTransport.eventWake);
    return true;
  }

  fontSize() {
    return Atomics.load(this.words, this.word + DisplayTransport.fontSizeMilli) / 1000;
  }

  dimensions() {
    return {
      cols: Atomics.load(this.words, this.word + DisplayTransport.terminalCols),
      rows: Atomics.load(this.words, this.word + DisplayTransport.terminalRows),
    };
  }

  geometry() {
    return {
      cursorCol: Atomics.load(this.words, this.word + DisplayTransport.cursorCol) >>> 0,
      cursorRow: Atomics.load(this.words, this.word + DisplayTransport.cursorRow) >>> 0,
      cellWidth: Atomics.load(this.words, this.word + DisplayTransport.cellWidth) >>> 0,
      cellHeight: Atomics.load(this.words, this.word + DisplayTransport.cellHeight) >>> 0,
      paddingX: Atomics.load(this.words, this.word + DisplayTransport.paddingX) >>> 0,
      paddingY: Atomics.load(this.words, this.word + DisplayTransport.paddingY) >>> 0,
    };
  }
}

class FramebufferPresenter {
  constructor(canvasElement, buffer, frameAddresses, capacity, displayTransport) {
    this.canvas = canvasElement;
    this.context = canvasElement.getContext("2d", { alpha: false });
    if (!this.context) throw new Error("Dolly requires a 2D canvas context");
    this.buffer = buffer;
    this.frameAddresses = frameAddresses;
    this.capacity = capacity;
    this.transport = displayTransport;
    this.sequence = -1;
    this.running = true;
  }

  start() {
    const paint = () => {
      if (!this.running) return;
      this.paint();
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);
  }

  paint() {
    const { words, word } = this.transport;
    const sequence = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
    if (sequence === this.sequence) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
      const index = Atomics.load(words, word + DisplayTransport.frameIndex) >>> 0;
      const width = Atomics.load(words, word + DisplayTransport.frameWidth) >>> 0;
      const height = Atomics.load(words, word + DisplayTransport.frameHeight) >>> 0;
      const stride = Atomics.load(words, word + DisplayTransport.frameStride) >>> 0;
      const length = stride * height;
      const address = this.frameAddresses[index];
      if (index > 1 || width === 0 || height === 0 || stride !== width * 4 ||
          length > this.capacity || address + length > this.buffer.byteLength) {
        throw new Error("Dolly published an invalid framebuffer");
      }
      const pixels = new Uint8ClampedArray(
        new Uint8ClampedArray(this.buffer, address, length),
      );
      const after = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
      if (before !== after) continue;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.context.putImageData(new ImageData(pixels, width, height), 0, 0);
      this.sequence = after;
      document.documentElement.dataset.frameSequence = String(after);
      const dimensions = this.transport.dimensions();
      document.documentElement.dataset.terminalCols = String(dimensions.cols);
      document.documentElement.dataset.terminalRows = String(dimensions.rows);
      const geometry = this.transport.geometry();
      document.documentElement.dataset.cursorCol = String(geometry.cursorCol);
      document.documentElement.dataset.cursorRow = String(geometry.cursorRow);
      document.documentElement.dataset.cellWidth = String(geometry.cellWidth);
      document.documentElement.dataset.cellHeight = String(geometry.cellHeight);
      document.documentElement.dataset.paddingX = String(geometry.paddingX);
      document.documentElement.dataset.paddingY = String(geometry.paddingY);
      return;
    }
  }
}

class NetworkTransport {
  static headerSize = 64;
  static state = 0;
  static sequence = 1;
  static status = 2;
  static length = 3;
  static eof = 4;
  static error = 5;
  static kind = 6;

  constructor(buffer, address, capacity, policy) {
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.word = address / 4;
    this.capacity = capacity;
    this.policy = policy;
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
      if (current === 1) return;
      const waiting = Atomics.waitAsync(this.words, index, current);
      if (waiting.async) await waiting.value;
    }
  }

  async publish(token, sequence, bytes, status, eof, error, kind) {
    await this.waitForWritable(token, sequence);
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
      const target = new URL(url, location.href);
      if ((target.protocol !== "http:" && target.protocol !== "https:") ||
          target.username !== "" || target.password !== "") {
        await this.publish(token, sequence, new Uint8Array(), status, true, 3, 0);
        return;
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
      const upperMethod = method.toUpperCase();
      const requestBytes = body?.byteLength ?? 0;
      const rule = this.policy.authorize(target, upperMethod, headers, requestBytes);
      const controller = new AbortController();
      this.controller = controller;
      timeout = setTimeout(() => controller.abort(), rule.timeoutMilliseconds);
      const response = await fetch(target, {
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
    } catch {
      if (this.activeToken === token &&
          (Atomics.load(this.words, this.word + NetworkTransport.sequence) >>> 0) === sequence) {
        await this.publish(token, sequence, new Uint8Array(), status, true, 1, 0);
      }
    } finally {
      clearTimeout(timeout);
      this.completedRequestCount += 1;
      if (this.activeToken === token) {
        this.activeToken = 0;
        this.activeSequence = 0;
        this.controller = null;
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

function appendBootstrap(text, flush = false) {
  const normalized = `${bootstrapFragment}${text}`
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const lastNewline = normalized.lastIndexOf("\n");
  let complete = "";
  if (flush) {
    complete = normalized;
    bootstrapFragment = "";
  } else if (lastNewline === -1) {
    bootstrapFragment = normalized.slice(-bootstrapMaximumCharacters);
  } else {
    complete = normalized.slice(0, lastNewline + 1);
    bootstrapFragment = normalized
      .slice(lastNewline + 1)
      .slice(-bootstrapMaximumCharacters);
  }
  if (complete === "") return;

  let offset = 0;
  while (offset < complete.length) {
    const newline = complete.indexOf("\n", offset);
    const end = newline === -1 ? complete.length : newline + 1;
    const record = complete.slice(offset, end).slice(-bootstrapMaximumCharacters);
    const node = document.createTextNode(record);
    bootstrapLines.push(node);
    bootstrapCharacters += record.length;
    bootstrapLog.append(node);
    offset = end;
  }

  while (bootstrapLines.length > bootstrapMaximumLines ||
         bootstrapCharacters > bootstrapMaximumCharacters) {
    const expired = bootstrapLines.shift();
    bootstrapCharacters -= expired.data.length;
    expired.remove();
  }
  bootstrapLog.scrollTop = bootstrapLog.scrollHeight;
}

async function toggleFullscreen(event) {
  if (event.key !== "F11") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
  } catch {
    document.documentElement.dataset.fullscreen = "failed";
  }
}

function sendResize() {
  if (!transport) return;
  if (!transport.pushResize(mount.clientWidth, mount.clientHeight, devicePixelRatio)) {
    requestAnimationFrame(sendResize);
  }
}

function handleKeyboardEvent(event) {
  if (!transport) return;
  const clipboardChord = event.ctrlKey && event.shiftKey &&
    !event.altKey && !event.metaKey;
  if (clipboardChord && event.code === "KeyV") {
    // Leave the browser's native paste gesture intact. Its PasteEvent carries
    // the bytes into the explicit Dolly paste buffer below.
    return;
  }
  if (clipboardChord && event.code === "KeyC") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown") {
      try {
        const text = transport.copySelection();
        if (text !== null) {
          void navigator.clipboard.writeText(text).then(
            () => { document.documentElement.dataset.clipboard = "copied"; },
            () => { document.documentElement.dataset.clipboard = "denied"; },
          );
        } else {
          document.documentElement.dataset.clipboard = "empty";
        }
      } catch (error) {
        document.documentElement.dataset.clipboard = "failed";
        document.documentElement.dataset.clipboardError =
          error instanceof Error ? error.message : String(error);
      }
    }
    return;
  }
  const interruptChord = event.type === "keydown" && event.ctrlKey &&
    !event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyC";
  if (interruptChord && transport.interruptForeground()) {
    networkTransport?.interrupt();
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (event.type === "keydown" && event.key === "F11") void toggleFullscreen(event);
  if (!transport.pushKey(event)) {
    document.documentElement.dataset.inputOverflow = "true";
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

window.addEventListener("keydown", handleKeyboardEvent, { capture: true });
window.addEventListener("keyup", handleKeyboardEvent, { capture: true });

let selecting = false;
let touchScroll = null;

function pointerPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.width === 0 ? 0 : (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: bounds.height === 0 ? 0 : (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function pushPointer(event, action) {
  const position = pointerPosition(event);
  if (!transport?.pushPointer(position.x, position.y, action, event)) {
    document.documentElement.dataset.inputOverflow = "true";
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !transport) return;
  canvas.setPointerCapture(event.pointerId);
  keyboard.focus({ preventScroll: true });
  if (event.pointerType === "touch") {
    touchScroll = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      scrolling: false,
    };
    event.preventDefault();
    return;
  }
  selecting = true;
  pushPointer(event, 1);
  event.preventDefault();
});
canvas.addEventListener("pointermove", (event) => {
  if (touchScroll?.pointerId === event.pointerId) {
    const horizontal = Math.abs(event.clientX - touchScroll.startX);
    const vertical = Math.abs(event.clientY - touchScroll.startY);
    if (!touchScroll.scrolling && vertical > 8 && vertical > horizontal) {
      touchScroll.scrolling = true;
    }
    if (touchScroll.scrolling) {
      const cellHeight = Math.max(1, transport.geometry().cellHeight);
      if (!transport.pushScroll((touchScroll.lastY - event.clientY) / cellHeight)) {
        document.documentElement.dataset.inputOverflow = "true";
      }
      touchScroll.lastY = event.clientY;
    }
    event.preventDefault();
    return;
  }
  if (!selecting || (event.buttons & 1) === 0) return;
  pushPointer(event, 2);
  event.preventDefault();
});
canvas.addEventListener("pointerup", (event) => {
  if (touchScroll?.pointerId === event.pointerId) {
    if (!touchScroll.scrolling) {
      pushPointer(event, 1);
      pushPointer(event, 0);
    }
    touchScroll = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    return;
  }
  if (!selecting || event.button !== 0) return;
  selecting = false;
  pushPointer(event, 0);
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
});
canvas.addEventListener("pointercancel", (event) => {
  if (touchScroll?.pointerId === event.pointerId) touchScroll = null;
  if (selecting) {
    selecting = false;
    pushPointer(event, 0);
  }
});
canvas.addEventListener("wheel", (event) => {
  if (!transport) return;
  const dimensions = transport.dimensions();
  const cellHeight = Math.max(1, transport.geometry().cellHeight);
  let deltaRows = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) deltaRows /= cellHeight;
  else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    deltaRows *= Math.max(1, dimensions.rows);
  }
  if (!transport.pushScroll(deltaRows)) {
    document.documentElement.dataset.inputOverflow = "true";
  }
  event.preventDefault();
}, { passive: false });
document.addEventListener("fullscreenchange", () => {
  document.documentElement.dataset.fullscreen = document.fullscreenElement ? "on" : "off";
  requestAnimationFrame(sendResize);
  keyboard.focus({ preventScroll: true });
});

async function submitInput(command, input = `${command}\r`) {
  const sequence = transport.currentResultSequence();
  document.documentElement.dataset.dollyCommand = command;
  if (!transport.pushText(input)) throw new Error("Dolly input mailbox is full");
  let timeout;
  const commandStatus = await Promise.race([
    transport.waitForResult(sequence),
    new Promise((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`timed out waiting for command: ${command}`)),
        60_000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  commandResults.push({ command, status: commandStatus });
  return commandStatus;
}

async function waitFor(predicate, description) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function runBrowserProof() {
  // Production boots directly into Pi. The shell regression suite exits that
  // resident TUI and waits for Dolly's recovery Slop process before submitting
  // command-shaped input.
  await waitFor(() => transport.foregroundPid() > 0, "default Pi foreground pid");
  const defaultPiPid = transport.foregroundPid();
  transport.pushSyntheticKey("d", "KeyD", 2);
  transport.pushSyntheticKey("d", "KeyD", 2, 0);
  await waitFor(
    () => transport.foregroundPid() > 0 &&
      transport.foregroundPid() !== defaultPiPid &&
      !transport.foregroundInterruptible() &&
      transport.inputIdle(),
    "recovery Slop foreground pid",
  );
  document.documentElement.dataset.defaultPi = "passed";

  const libcurlCheckBody =
    `int main(int argc, char **argv) { (void)argc; (void)argv; CURL *curl = curl_easy_init(); struct curl_slist *headers = 0; headers = curl_slist_append(headers, "X-Dolly-Test: yes"); curl_easy_setopt(curl, CURLOPT_URL, "${location.origin}/fixture/libcurl-post"); curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "payload"); curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, 7L); curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers); CURLcode result = curl_easy_perform(curl); curl_slist_free_all(headers); curl_easy_cleanup(curl); return result; }`;
  const libcurlSourceCommand =
    `awk 'BEGIN { print "#include <curl/curl.h>"; print "${libcurlCheckBody.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" }' > libcurl-check.c`;
  const makefileCommand =
    `awk 'BEGIN { print "WHERE := $(shell pwd)"; print "all: make-demo"; print "make-demo: make-main.o make-value.o"; print "\\t$(CC) make-main.o make-value.o -o $@"; print "make-main.o: make-main.c"; print "\\t$(CC) -std=c17 -c $< -o $@"; print "make-value.o: make-value.c"; print "\\t$(CC) -std=c17 -c $< -o $@"; print "report:"; print "\\t@echo MAKE-SHELL=$(SHELL)"; print "\\t@echo MAKE-WHERE=$(WHERE)" }' > Makefile`;
  const randomSourceCommand =
    `awk 'BEGIN { print "#include <sys/random.h>"; print "int main(void) { unsigned char bytes[1024]; return getrandom(bytes, sizeof(bytes), 0) == sizeof(bytes) ? 0 : 1; }" }' > random-check.c`;
  const beforeInteractive = [
    ["help", "\x1b[Ahelx\x7fp\r"],
    ["cat /workspace/rebuild-only.txt", undefined, 1],
    ["echo shell-created > shell.txt"],
    ["cat shell.txt"],
    ["echo alpha > alpha.txt"],
    ["echo Beta > beta.txt"],
    ["cat alpha.txt beta.txt > corpus.txt"],
    ["slop -c 'echo SLOP-C'"],
    ["grep -q Beta corpus.txt && echo SLOP-AND"],
    ["grep missing corpus.txt || echo SLOP-OR"],
    ["! grep missing corpus.txt && echo SLOP-NOT"],
    ["VALUE=42 slop -c 'echo SLOP-VAR-$VALUE'"],
    ["echo SLOP-SUB-$(pwd)"],
    ["slop -e -c 'grep missing corpus.txt && echo WRONG; echo SLOP-ERREXIT-AND'"],
    ["slop -c 'exit nope'", undefined, 2],
    ["echo first > append.txt"],
    ["echo second >> append.txt"],
    ["cat append.txt"],
    ["grep -n -i beta corpus.txt"],
    ["grep -c a corpus.txt"],
    ["grep -v alpha corpus.txt"],
    ["grep -q Beta corpus.txt"],
    ["grep missing corpus.txt", undefined, 1],
    ["echo PIPE-GREP | grep PIPE"],
    ["grep -Z", undefined, 2],
    ["echo grep-runtime-survived"],
    ["sed s/Beta/Gamma/ corpus.txt"],
    ["sed -n 2p corpus.txt"],
    ["echo SED-PIPE | sed s/SED/DOLLY/"],
    ["head -n 1 corpus.txt"],
    ["head -1 beta.txt"],
    ["wc -l corpus.txt"],
    ["echo one | wc -w"],
    ["awk --version"],
    ["echo \"key:value\" > colon.txt"],
    ["awk -F: '{print $2}' colon.txt"],
    ["echo \"one 2\" > awk-one.txt"],
    ["echo \"three 4\" > awk-two.txt"],
    ["cat awk-one.txt awk-two.txt > awk-data.txt"],
    ["echo awk-*.txt"],
    ["awk '{sum += $2} END {print sum}' awk-data.txt"],
    ["awk -v prefix=V '{print prefix $1}' awk-one.txt"],
    ["echo '{print toupper($1)}' > upper.awk"],
    ["awk -f upper.awk awk-two.txt"],
    ["echo \"pipe 7\" | awk '{print $2 * 6}'"],
    ["echo 'a,\"b,c\"' > csv.txt"],
    ["awk --csv '{print NF \":\" $2}' csv.txt"],
    ["awk 'BEGIN {print system(\"echo HOST-ESCAPE\")}'"],
    ["awk 'BEGIN {status = (\"denied\" | getline value); print status; exit status == -1 ? 0 : 1}'"],
    ["awk -f", undefined, 2],
    [`qjs -e 'Dolly.httpStart("GET", "${location.origin}/fixture/http.txt", "", null)'`],
    ["curl -fsSL /fixture/http.txt -o fetched.txt"],
    ["cat fetched.txt"],
    ["curl -f /fixture/missing", undefined, 22],
    [libcurlSourceCommand],
    ["cc libcurl-check.c -lcurl -o libcurl-check"],
    ["./libcurl-check"],
    ["git --version"],
    ["git config --global --get user.name"],
    ["git config --global --get user.email"],
    ["git config --global user.email asdf"],
    ["git config --global --get user.email"],
    ["mkdir git-repo"],
    ["cd git-repo"],
    ["git init"],
    ["echo tracked > tracked.txt"],
    ["git add tracked.txt"],
    ["git commit -m initial"],
    ["git --no-pager log --oneline"],
    [`awk 'BEGIN {print "list"; print ""}' | /usr/libexec/dolly/git-remote-http origin ${location.origin}/fixture/git`],
    ["cd .."],
    ["pwd"],
    ["mkdir path-test"],
    ["cd path-test"],
    ["pwd"],
    ["cd .."],
    ["mkdir -p flags/deep"],
    ["mkdir -p flags/deep"],
    ["echo not-a-directory > not-a-directory"],
    ["mkdir -p not-a-directory", undefined, 1],
    ["touch flags/.hidden"],
    ["echo visible > flags/visible"],
    ["ls flags"],
    ["echo LS-ALL-BEGIN"],
    ["ls -a flags"],
    ["echo LS-ALL-END"],
    ["cat -n shell.txt"],
    ["pwd -P"],
    ["rm -f flags/missing"],
    ["rm -rf flags"],
    ["ls flags", undefined, 1],
    ["ls -la"],
    ["stat -c '%F %s' shell.txt"],
    ["file shell.txt"],
    ["[ -f shell.txt ]"],
    ["[ ! -d shell.txt ]"],
    ["test -d shell.txt", undefined, 1],
    ["test -d shell.txt; test $? -eq 1"],
    ["echo MOVED > move-source && mv move-source move-target && grep -q MOVED move-target"],
    ["printf 'PRINTF-%s\\n' OK | grep -q PRINTF-OK"],
    ["touch -c absent"],
    ["ls absent", undefined, 1],
    ["echo -n tight > tight.txt"],
    ["cat tight.txt"],
    ["ls /bin"],
    ["echo BIN-LIST-END"],
    ["echo /b* | grep -q /bin"],
    ["ls /usr/bin"],
    ["echo USR-BIN-LIST-END"],
    ["zig version"],
    ["echo 'export fn browser_zig_answer() callconv(.c) u32 { return 42; }' > browser-answer.zig"],
    ["zig build-obj -OReleaseSmall -target wasm64-emscripten -mcpu=generic+atomics -fPIC -fsingle-threaded -fcompiler-rt -lc --name browser-zig-answer -femit-bin=browser-answer.o -Mroot=/workspace/browser-answer.zig"],
    ["/usr/libexec/dolly/zig-object-check browser-answer.o"],
    ["echo 'extern unsigned browser_zig_answer(void); int main(void) { return browser_zig_answer() == 42 ? 0 : 1; }' > browser-zig-check.c"],
    ["cc browser-zig-check.c browser-answer.o -o browser-zig-check"],
    ["./browser-zig-check"],
    ["ls /usr/lib/libghostty-vt.a"],
    ["ghostty-vt"],
    ["graphics-demo --frames 2", undefined,
      document.documentElement.dataset.image === "gamedev" ? 0 : 127],
    ["cc --version"],
    ["c++ --version"],
    ["echo \"int answer(void) { return 42; }\" > answer.c"],
    ["cc -Wall -Wextra -O2 -c answer.c -o answer.o"],
    ["cc -pedantic -c answer.c -o answer-pedantic.o"],
    ["echo \"int answer(void); int main(int argc, char **argv) { (void)argc; (void)argv; return answer() == 42 ? 0 : 1; }\" > use.c"],
    ["cc -std=c17 use.c answer.o -o c-multi"],
    ["./c-multi"],
    ["echo \"int main(void) { volatile unsigned long n = 0; for (;;) n++; }\" > interrupt-loop.c"],
    ["cc -O2 interrupt-loop.c -o interrupt-loop"],
    ["ld --help"],
    ["cc -c use.c -o use.o"],
    ["ld use.o answer.o -o c-linked"],
    ["./c-linked"],
    ["ld use.c -o rejected", undefined, 64],
    ["ar --version"],
    ["ar rcs libanswer.a answer.o"],
    ["cc use.c libanswer.a -o archive-direct"],
    ["./archive-direct"],
    ["cc use.c -L. -lanswer -o archive-library"],
    ["./archive-library"],
    ["echo \"int main() { constexpr int value = 6 * 7; return value == 42 ? 0 : 1; }\" > cli.cpp"],
    ["c++ -std=c++23 cli.cpp -o cpp-cli"],
    ["./cpp-cli"],
    ["echo \"void exit(int); int main(int argc, char **argv) { (void)argc; (void)argv; exit(23); }\" > exit23.c"],
    ["cc exit23.c -o exit23"],
    ["./exit23", undefined, 23],
    ["echo command-local-exit-survived"],
    ["cc --definitely-unsupported", undefined, 64],
    [randomSourceCommand],
    ["cc random-check.c -o random-check"],
    ["./random-check"],
    ["cat /bin/echo > invalid-module"],
    ["echo invalid >> invalid-module"],
    ["./invalid-module", undefined, 126],
    ["make --version"],
    ["echo \"int value(void) { return 42; }\" > make-value.c"],
    ["echo \"#include <stdio.h>\" > make-main.c"],
    ["echo \"int value(void); int main(void) { printf(\\\"MAKE-%d\\\\n\\\", value()); return value() == 42 ? 0 : 1; }\" >> make-main.c"],
    [makefileCommand],
    ["make -j8 report"],
    ["make -j8"],
    ["./make-demo"],
    ["make -q"],
    ["touch make-value.c"],
    ["make -q", undefined, 1],
    ["make -j8"],
    ["qjs --version"],
    ["qjs -e \"Dolly.writeFile('/tmp/qjs-tty.txt', [process.stdin.isTTY, process.stdout.isTTY, process.stderr.isTTY].join(','))\""],
    ["grep -q '^true,true,true$' /tmp/qjs-tty.txt"],
    ["qjs -e \"Dolly.writeFile('/tmp/qjs-redirect.txt', String(process.stdout.isTTY))\" > /tmp/qjs-discard.txt"],
    ["grep -q '^false$' /tmp/qjs-redirect.txt"],
    ["qjs -e \"console.log('JS-' + (6 * 7))\""],
    ["echo \"console.log('ARGS-' + scriptArgs.join(':'))\" > args.js"],
    ["qjs args.js alpha beta"],
    ["echo \"export const answer = 42\" > esm-value.mjs"],
    ["echo \"import { answer } from './esm-value.mjs'; console.log('ESM-' + answer)\" > esm-main.mjs"],
    ["qjs esm-main.mjs"],
    ["qjs -e \"Dolly.writeFile('/workspace/qjs-persist.txt', 'QJS-PERSIST')\""],
    ["cat qjs-persist.txt"],
    ["echo \"print([1,2,3].map(x => x * 2).join(','))\" | qjs -"],
    ["qjs -e \"throw new Error('JS-EXPECTED')\"", undefined, 1],
    ["qjs --unsupported", undefined, 64],
    ["janis --version"],
    ["janis -e \"const c = process.getBuiltinModule('node:crypto'); if (c.createHash('sha256').update('abc').digest('hex') !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') process.exit(1); console.log('JANIS-HASH-OK')\""],
    ["janis -e \"const h = process.getBuiltinModule('node:http'); const s = new h.Server(); s.on('error', e => { if (e.code !== 'ENOSYS') process.exit(1); console.log('JANIS-LISTEN-ENOSYS'); }); s.listen(1455)\""],
    ["pi --version"],
    ["echo '{\"openrouter\":{\"type\":\"api_key\",\"key\":\"sandbox-placeholder\"},\"openai-codex\":{\"type\":\"oauth\",\"access\":\"sandbox-placeholder\",\"refresh\":\"sandbox-placeholder\",\"expires\":4102444800000}}' > /home/dolly/.pi/agent/auth.json"],
    ["pi --list-models openrouter > /tmp/pi-openrouter-models.txt"],
    ["grep -q 'openrouter' /tmp/pi-openrouter-models.txt"],
    ["pi --list-models openai-codex > /tmp/pi-codex-models.txt"],
    ["grep -q 'openai-codex' /tmp/pi-codex-models.txt"],
    ["rm -f /home/dolly/.pi/agent/auth.json"],
  ];
  const afterInteractive = [
    ["demo"],
    ["demo"],
  ];

  for (const [command, input] of beforeInteractive) {
    await submitInput(command, input ?? `${command}\r`);
  }

  for (const [command, input] of afterInteractive) {
    await submitInput(command, input ?? `${command}\r`);
  }

  const count = beforeInteractive.length + afterInteractive.length;
  const proofResults = commandResults.slice(-count);
  const expectedStatuses = [
    ...beforeInteractive.map((entry) => entry[2] ?? 0),
    ...afterInteractive.map((entry) => entry[2] ?? 0),
  ];
  const passed = proofResults.length === count
    && proofResults.every((result, index) => result.status === expectedStatuses[index]);
  if (!passed) {
    const mismatch = proofResults.findIndex(
      (result, index) => result.status !== expectedStatuses[index],
    );
    document.documentElement.dataset.dollyFailure = JSON.stringify(
      mismatch >= 0
        ? {
            index: mismatch,
            command: proofResults[mismatch].command,
            actual: proofResults[mismatch].status,
            expected: expectedStatuses[mismatch],
          }
        : { actualResults: proofResults.length, expectedResults: count },
    );
  }
  document.documentElement.dataset.dollyStatus = passed ? "passed" : "failed";
}

async function boot() {
  document.documentElement.dataset.dollyStatus = "loading";
  if (!crossOriginIsolated) {
    throw new Error("Dolly requires cross-origin isolation for shared Wasm memory");
  }
  const configured = globalThis.DOLLY_BOOT;
  if (configured === null || typeof configured !== "object" ||
      !["default", "gamedev", "custom"].includes(configured.image) ||
      !["snapshot", "rebuild"].includes(configured.mode) ||
      (configured.image === "custom" && configured.mode !== "rebuild")) {
    throw new Error("invalid Dolly route configuration");
  }
  const bootMode = configured.mode;
  const image = configured.image;
  const applicationBase = new URL("../", import.meta.url);
  const trustedBootstrapSources = [
    ...DOLLY_IMAGES.map((definition) => ({
      path: `/${definition.dollyfile}`,
      byteLength: definition.byteLength,
    })),
    ...DOLLY_STATIC_SOURCES,
  ];
  const httpPolicy = consumeDollyHttpPolicy(
    window,
    trustedBootstrapSources,
    applicationBase,
  );
  const customSource = image === "custom"
    ? sessionStorage.getItem("dolly-custom-source")
    : undefined;
  if (image === "custom" && !customSource) {
    throw new Error("No uploaded Dollyfile is available in this tab. Return to the Dolly menu.");
  }
  appendBootstrap(`DOLLY / ${image.toUpperCase()} / ${bootMode === "rebuild"
    ? "REBUILD FROM SOURCE"
    : "PRECOMPILED SYSTEM"}\n\n`);
  mount.addEventListener("pointerdown", () => keyboard.focus({ preventScroll: true }));
  keyboard.addEventListener("compositionend", (event) => {
    if (!transport?.pushText(event.data)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
    keyboard.value = "";
  });
  keyboard.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text && !transport?.pushPaste(text)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
  });

  const workerUrl = new URL("./runtime-worker.mjs", import.meta.url);
  runtimeWorker = new Worker(workerUrl, {
    type: "module",
    name: "dolly-runtime",
  });
  runtimeWorker.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "bootstrap") {
      appendBootstrap(message.text);
    } else if (message.type === "bootstrap-bytes") {
      appendBootstrap(bootstrapDecoder.decode(message.bytes, { stream: true }));
    } else if (message.type === "system-snapshot") {
      builtSystemSnapshot = message.bytes;
    } else if (message.type === "broker-ready") {
      try {
        if (networkTransport !== undefined || message.httpVersion !== 2) {
          throw new Error("Dolly supplied an invalid HTTP broker handshake");
        }
        networkTransport = new NetworkTransport(
          message.memory,
          message.httpAddress,
          message.httpCapacity,
          httpPolicy,
        );
        runtimeWorker.postMessage({ type: "broker-ready-ack" });
      } catch (error) {
        displayFatal(error instanceof Error ? error.message : String(error));
      }
    } else if (message.type === "exited") {
      document.documentElement.dataset.dollyStatus = "exited";
    } else if (message.type === "http-request") {
      networkRequestChain = networkRequestChain.then(() => {
        if (!networkTransport) throw new Error("HTTP request arrived before broker setup");
        return networkTransport.request(message);
      }).catch((error) => {
        document.documentElement.dataset.networkError = error.message;
      });
    } else if (message.type === "http-cancel") {
      try {
        if (!networkTransport) throw new Error("HTTP cancellation arrived before broker setup");
        networkTransport.cancelBefore(message.sequence);
      } catch (error) {
        document.documentElement.dataset.networkError = error.message;
      }
    } else if (message.type === "download") {
      try {
        startBrowserDownload(message);
      } catch (error) {
        displayFatal(error instanceof Error ? error.message : String(error));
      }
    } else if (message.type === "error" && runtimeReady) {
      displayFatal(message.message);
    }
  });
  runtimeWorker.postMessage({
    type: "configure",
    image,
    mode: bootMode,
    ...(customSource === undefined ? {} : { customSource }),
  });

  const ready = await new Promise((resolve, reject) => {
    runtimeWorker.addEventListener("message", function onMessage(event) {
      if (event.data.type === "ready") {
        runtimeWorker.removeEventListener("message", onMessage);
        resolve(event.data);
      } else if (event.data.type === "error") {
        runtimeWorker.removeEventListener("message", onMessage);
        reject(new Error(event.data.message));
      }
    });
    runtimeWorker.addEventListener("error", reject, { once: true });
  });
  appendBootstrap(bootstrapDecoder.decode(), true);
  runtimeReady = true;
  if (ready.version !== 3) throw new Error(`unsupported display mailbox ${ready.version}`);
  if (ready.httpVersion !== 2) throw new Error(`unsupported HTTP mailbox ${ready.httpVersion}`);
  if (ready.frameAddresses.length !== 2 || ready.frameAddresses.some((address) => !address)) {
    throw new Error("Dolly did not publish both framebuffer addresses");
  }
  if (ready.bootMode !== bootMode) throw new Error("runtime boot mode mismatch");
  if (ready.routeImage !== image || (image !== "custom" && ready.image !== image)) {
    throw new Error("runtime image mismatch");
  }
  if (!networkTransport || ready.httpAddress !== networkTransport.address ||
      ready.httpCapacity !== networkTransport.capacity) {
    throw new Error("runtime HTTP mailbox changed after broker setup");
  }
  document.documentElement.dataset.image = ready.image;
  document.documentElement.dataset.bootMode = ready.bootMode;
  document.documentElement.dataset.snapshotBytes = String(ready.snapshotBytes);
  transport = new DisplayTransport(
    ready.memory,
    ready.address,
    ready.eventSize,
    ready.eventCapacity,
    ready.pasteAddress,
    ready.copyAddress,
    ready.clipboardCapacity,
  );
  presenter = new FramebufferPresenter(
    canvas,
    ready.memory,
    ready.frameAddresses,
    ready.frameCapacity,
    transport,
  );
  presenter.start();
  bootstrapLog.hidden = true;
  canvas.hidden = false;
  document.documentElement.dataset.terminal = "ghostty-rgba-wasm";
  resizeObserver = new ResizeObserver(sendResize);
  resizeObserver.observe(mount);
  sendResize();

  keyboard.focus({ preventScroll: true });
  document.documentElement.dataset.dollyStatus = "ready";

  window.__dolly = {
    worker: runtimeWorker,
    display: presenter,
    transport,
    commandResults,
    get foregroundPid() {
      return transport.foregroundPid();
    },
    get graphicsActive() {
      return transport.graphicsActive();
    },
    get httpActive() {
      return networkTransport.active;
    },
    get httpRequestCount() {
      return networkTransport.requestCount;
    },
    get httpCompletedRequestCount() {
      return networkTransport.completedRequestCount;
    },
    get systemSnapshot() {
      return builtSystemSnapshot;
    },
    submit(command) {
      return submitInput(command);
    },
    input(data) {
      return transport.pushText(data);
    },
    paste(data) {
      return transport.pushPaste(data);
    },
    copySelection() {
      return transport.copySelection();
    },
    key(key, code, modifiers = 0) {
      return transport.pushSyntheticKey(key, code, modifiers);
    },
    get fontSize() {
      return transport.fontSize();
    },
  };

  if (new URLSearchParams(location.search).get("autorun") === "shell") {
    await runBrowserProof();
  }
}

boot().catch((error) => {
  displayFatal(error instanceof Error ? error.message : String(error));
});
