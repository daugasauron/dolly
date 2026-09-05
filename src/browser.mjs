import {
  consumeDollyHttpPolicy,
  isDollyCredentialHeader,
  stripDollyBrowserOwnedHeaders,
} from "./http-policy.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION,
  DOLLY_SESSION_MAX_BYTES,
  decodeSessionSnapshot,
  encodeSessionSnapshot,
  loadStoredSession,
  saveStoredSession,
  sessionImageIdentity,
  validSessionName,
} from "./session-store.mjs";
import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";

const mount = document.querySelector("#terminal");
const canvas = document.querySelector("#display");
const keyboard = document.querySelector("#keyboard");
const bootstrapLog = document.querySelector("#bootstrap-log");
const phoneMenuButton = document.querySelector("#phone-menu-button");
const phoneMenu = document.querySelector("#phone-menu");
const sessionSaveButton = document.querySelector("#session-save-button");
bootstrapLog.replaceChildren();

const defaultFontSizeMilli = 15000;
const bootstrapMaximumLines = 40;
const bootstrapMaximumCharacters = 8192;
const bootstrapLines = [];
let bootstrapCharacters = 0;
let bootstrapFragment = "";
const hardInterruptGraceMilliseconds = 2000;
const hardInterruptRecoveryKey = "dolly-hard-interrupt-v1";

const encoder = new TextEncoder();
const textDecoder = new TextDecoder();
const bootstrapDecoder = new TextDecoder();
const commandResults = [];
const runtimeFailureRejectors = new Set();

let runtimeWorker;
let transport;
let sessionTransport;
let networkTransport;
let presenter;
let resizeObserver;
let runtimeReady = false;
let builtSystemSnapshot = null;
let networkRequestChain = Promise.resolve();
const maximumDownloadBytes = 64 * 1024 * 1024;
let downloadCount = 0;
let activeImage = null;
let activeImageIdentity = null;
let currentSessionName = null;
let sessionSavePromise = null;
let pendingForegroundInterrupt = null;
let hardRestarting = false;

let hardInterruptRecovery = null;
try {
  const encoded = sessionStorage.getItem(hardInterruptRecoveryKey);
  sessionStorage.removeItem(hardInterruptRecoveryKey);
  if (encoded !== null) {
    const candidate = JSON.parse(encoded);
    if (candidate?.buildId === DOLLY_BUILD_ID &&
        typeof candidate.image === "string" &&
        (candidate.session === null || validSessionName(candidate.session))) {
      hardInterruptRecovery = candidate;
    }
  }
} catch {
  // Recovery is only a user-facing hint. The worker restart itself must not
  // depend on browser storage being available.
}

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
  static animationFrameSequence = 30;
  static cursorStyle = 31;

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

  publishAnimationFrame() {
    if (!this.graphicsActive()) return;
    Atomics.add(
      this.words,
      this.word + DisplayTransport.animationFrameSequence,
      1,
    );
    Atomics.add(this.words, this.word + DisplayTransport.eventWake, 1);
    Atomics.notify(this.words, this.word + DisplayTransport.eventWake);
  }

  currentAnimationFrameSequence() {
    return Atomics.load(
      this.words,
      this.word + DisplayTransport.animationFrameSequence,
    ) >>> 0;
  }

  cursorStyle() {
    return Atomics.load(
      this.words,
      this.word + DisplayTransport.cursorStyle,
    ) >>> 0;
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

  wake() {
    Atomics.add(this.words, this.word + DisplayTransport.eventWake, 1);
    Atomics.notify(this.words, this.word + DisplayTransport.eventWake);
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

class SessionTransport {
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

  constructor(buffer, address, nameAddress, nameCapacity,
              transferAddress, transferCapacity, displayTransport) {
    if (!(buffer instanceof SharedArrayBuffer) || address <= 0 || address % 4 !== 0 ||
        nameAddress <= 0 || nameCapacity < 65 ||
        nameAddress + nameCapacity > buffer.byteLength ||
        transferAddress <= 0 || transferCapacity !== 1024 * 1024 ||
        transferAddress + transferCapacity > buffer.byteLength) {
      throw new Error("Dolly supplied an invalid session mailbox");
    }
    this.buffer = buffer;
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.word = address / 4;
    this.nameAddress = nameAddress;
    this.nameCapacity = nameCapacity;
    this.transferAddress = transferAddress;
    this.transferCapacity = transferCapacity;
    this.displayTransport = displayTransport;
  }

  readU64(lowIndex, highIndex) {
    const low = Atomics.load(this.words, this.word + lowIndex) >>> 0;
    const high = Atomics.load(this.words, this.word + highIndex) >>> 0;
    const value = (BigInt(high) << 32n) | BigInt(low);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Dolly session range exceeds JavaScript's safe address range");
    }
    return Number(value);
  }

  async capture(name) {
    if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
    const nameBytes = encoder.encode(name);
    if (nameBytes.byteLength >= this.nameCapacity) {
      throw new Error("Dolly session name exceeds its mailbox");
    }
    const published = Atomics.load(
      this.words, this.word + SessionTransport.requestSequence,
    ) >>> 0;
    const completed = Atomics.load(
      this.words, this.word + SessionTransport.completedSequence,
    ) >>> 0;
    if (published !== completed) throw new Error("A Dolly session save is already active");
    let chunkSequence = Atomics.load(
      this.words, this.word + SessionTransport.chunkSequence,
    ) >>> 0;
    this.bytes.fill(0, this.nameAddress, this.nameAddress + this.nameCapacity);
    this.bytes.set(nameBytes, this.nameAddress);
    Atomics.store(
      this.words, this.word + SessionTransport.nameLength, nameBytes.byteLength,
    );
    const requested = (published + 1) >>> 0;
    Atomics.store(
      this.words, this.word + SessionTransport.requestSequence, requested | 0,
    );
    this.displayTransport.wake();
    let snapshot = null;
    let snapshotOffset = 0;
    for (;;) {
      const chunkIndex = this.word + SessionTransport.chunkSequence;
      while ((Atomics.load(this.words, chunkIndex) >>> 0) === chunkSequence) {
        const observed = Atomics.load(this.words, chunkIndex);
        const waiting = Atomics.waitAsync(this.words, chunkIndex, observed);
        if (waiting.async) await waiting.value;
      }
      const publishedChunk = Atomics.load(this.words, chunkIndex) >>> 0;
      if (publishedChunk !== ((chunkSequence + 1) >>> 0)) {
        throw new Error("Dolly session chunk sequence skipped");
      }
      const length = Atomics.load(
        this.words, this.word + SessionTransport.chunkLength,
      ) >>> 0;
      const eof = Atomics.load(
        this.words, this.word + SessionTransport.chunkEof,
      ) !== 0;
      const total = this.readU64(
        SessionTransport.totalSizeLow, SessionTransport.totalSizeHigh,
      );
      if (length > this.transferCapacity || snapshotOffset > total - length) {
        throw new Error("Dolly published an invalid session chunk");
      }
      if (snapshot === null && total !== 0) {
        if (total < 16 || total > DOLLY_SESSION_MAX_BYTES) {
          throw new Error("Dolly published an invalid session snapshot size");
        }
        snapshot = new Uint8Array(total);
      }
      if (length !== 0) {
        if (snapshot === null) throw new Error("Dolly published data without a session size");
        snapshot.set(
          new Uint8Array(this.buffer, this.transferAddress, length),
          snapshotOffset,
        );
        snapshotOffset += length;
      }
      Atomics.store(
        this.words,
        this.word + SessionTransport.chunkConsumedSequence,
        publishedChunk | 0,
      );
      Atomics.notify(
        this.words,
        this.word + SessionTransport.chunkConsumedSequence,
      );
      chunkSequence = publishedChunk;
      if (eof) break;
    }
    const completedIndex = this.word + SessionTransport.completedSequence;
    while ((Atomics.load(this.words, completedIndex) >>> 0) !== requested) {
      const observed = Atomics.load(this.words, completedIndex);
      const waiting = Atomics.waitAsync(this.words, completedIndex, observed);
      if (waiting.async) await waiting.value;
    }
    const status = Atomics.load(this.words, this.word + SessionTransport.status);
    if (status !== 0) throw new Error(`Dolly session capture failed with status ${status}`);
    if (snapshot === null || snapshotOffset !== snapshot.byteLength) {
      throw new Error("Dolly session snapshot was incomplete");
    }
    return snapshot.buffer;
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
      this.transport.publishAnimationFrame();
      this.updateCursor();
      this.paint();
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);
  }

  stop() {
    this.running = false;
  }

  updateCursor() {
    const styles = ["text", "default", "crosshair", "pointer", "none"];
    const style = styles[this.transport.cursorStyle()] ?? "default";
    if (this.canvas.style.cursor !== style) this.canvas.style.cursor = style;
    document.documentElement.dataset.cursorStyle = style;
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
      stripDollyBrowserOwnedHeaders(headers);
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
    } catch (error) {
      const requestIsCurrent = this.activeToken === token &&
        (Atomics.load(this.words, this.word + NetworkTransport.sequence) >>> 0) === sequence;
      // Policy denials, quota failures, fetch errors, and command teardown are
      // request results delivered through the typed mailbox. Only failures in
      // the outer request chain populate the browser diagnostic dataset.
      if (requestIsCurrent) {
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

async function saveCurrentSession(requestedName) {
  if (sessionSavePromise) return sessionSavePromise;
  sessionSavePromise = (async () => {
    if (!runtimeReady || !sessionTransport || !activeImage) {
      throw new Error("Dolly is not ready to save a session");
    }
    if (!activeImageIdentity) {
      throw new Error("Uploaded custom images cannot save named sessions yet");
    }
    let name = requestedName ?? currentSessionName;
    if (name === null) {
      name = window.prompt("Save Dolly session as:", "");
      if (name === null) return null;
      name = name.trim();
    }
    if (!validSessionName(name)) {
      throw new Error("Session names use 1-64 letters, numbers, '.', '_' or '-'");
    }
    document.documentElement.dataset.sessionStatus = "capturing";
    const snapshot = await sessionTransport.capture(name);
    document.documentElement.dataset.sessionStatus = "compressing";
    const encoded = await encodeSessionSnapshot(snapshot);
    document.documentElement.dataset.sessionStatus = "storing";
    await saveStoredSession({
      name,
      formatVersion: DOLLY_SESSION_FORMAT_VERSION,
      buildId: DOLLY_BUILD_ID,
      image: activeImage,
      imageIdentity: activeImageIdentity,
      updatedAt: Date.now(),
      encoding: encoded.encoding,
      bytes: encoded.bytes,
    });
    currentSessionName = name;
    document.documentElement.dataset.session = name;
    document.documentElement.dataset.sessionBytes = String(encoded.bytes.byteLength);
    document.documentElement.dataset.sessionStatus = "saved";
    const target = new URL("load/", new URL("../", import.meta.url));
    target.searchParams.set("session", name);
    history.replaceState(null, "", target);
    return name;
  })().catch((error) => {
    document.documentElement.dataset.sessionStatus = "failed";
    document.documentElement.dataset.sessionError =
      error instanceof Error ? error.message : String(error);
    throw error;
  }).finally(() => {
    sessionSavePromise = null;
  });
  return sessionSavePromise;
}

sessionSaveButton.addEventListener("click", () => {
  closePhoneMenu();
  void saveCurrentSession().catch(() => {});
});

function clearPendingForegroundInterrupt() {
  if (pendingForegroundInterrupt !== null) {
    clearTimeout(pendingForegroundInterrupt.timeout);
    pendingForegroundInterrupt = null;
  }
}

function hardRestartRuntime(pid) {
  if (hardRestarting) return;
  hardRestarting = true;
  clearPendingForegroundInterrupt();
  document.documentElement.dataset.dollyStatus = "hard-restarting";
  document.documentElement.dataset.hardInterruptPid = String(pid);
  networkTransport?.interrupt();
  presenter?.stop();
  resizeObserver?.disconnect();
  runtimeReady = false;
  try {
    sessionStorage.setItem(hardInterruptRecoveryKey, JSON.stringify({
      buildId: DOLLY_BUILD_ID,
      image: activeImage,
      session: currentSessionName,
    }));
  } catch {
    // The hard stop remains effective even when sessionStorage is unavailable.
  }
  runtimeWorker?.terminate();
  location.reload();
}

function requestForegroundInterrupt() {
  if (!transport) return false;
  const pid = transport.foregroundPid();
  if (pid <= 0 || !transport.foregroundInterruptible()) return false;
  const resultSequence = transport.currentResultSequence();
  const repeated = pendingForegroundInterrupt?.pid === pid &&
    pendingForegroundInterrupt.resultSequence === resultSequence;
  if (!transport.interruptForeground()) return false;
  networkTransport?.interrupt();
  if (repeated) {
    hardRestartRuntime(pid);
    return true;
  }
  clearPendingForegroundInterrupt();
  const timeout = setTimeout(() => {
    if (runtimeReady && transport?.foregroundPid() === pid &&
        transport.currentResultSequence() === resultSequence &&
        transport.foregroundInterruptible()) {
      hardRestartRuntime(pid);
    } else {
      clearPendingForegroundInterrupt();
    }
  }, hardInterruptGraceMilliseconds);
  pendingForegroundInterrupt = { pid, resultSequence, timeout };
  return true;
}

function handleKeyboardEvent(event) {
  if (!transport) return;
  const clipboardChord = event.ctrlKey && event.shiftKey &&
    !event.altKey && !event.metaKey;
  if (clipboardChord && event.code === "KeyS") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown" && !event.repeat) {
      void saveCurrentSession().catch(() => {});
    }
    return;
  }
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
  if (interruptChord && requestForegroundInterrupt()) {
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
  let rejectRuntimeFailure;
  const runtimeFailure = new Promise((_resolve, reject) => {
    rejectRuntimeFailure = reject;
    runtimeFailureRejectors.add(reject);
  });
  const commandStatus = await Promise.race([
    transport.waitForResult(sequence),
    runtimeFailure,
  ]).finally(() => runtimeFailureRejectors.delete(rejectRuntimeFailure));
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
  const imageDefinition = DOLLY_IMAGES.find(({ image }) => image === activeImage);
  const recipes = new Set(imageDefinition?.recipes?.map(({ name }) => name));
  const hasRecipe = (name) => recipes.has(name);
  // The regression suite reaches the recovery shell without changing normal
  // image startup. Pi exits on Ctrl-D, while the gamedev entry exits on Q.
  await waitFor(() => transport.foregroundPid() > 0 &&
    transport.foregroundPid() === Number(document.documentElement.dataset.entryPid),
  "image entry foreground pid");
  if (activeImage !== "default") {
    const entryPid = transport.foregroundPid();
    if (activeImage === "gamedev") {
      await waitFor(() => transport.graphicsActive(), "gamedev entry display lease");
      transport.pushSyntheticKey("q", "KeyQ");
      transport.pushSyntheticKey("q", "KeyQ", 0, 0);
    } else {
      transport.pushSyntheticKey("d", "KeyD", 2);
      transport.pushSyntheticKey("d", "KeyD", 2, 0);
    }
    await waitFor(
      () => transport.foregroundPid() > 0 &&
        transport.foregroundPid() !== entryPid &&
        !transport.foregroundInterruptible() &&
        transport.inputIdle(),
      "recovery Slop foreground pid",
    );
  }
  document.documentElement.dataset.defaultPi = "passed";

  const beforeInteractive = [
    ["help", "\x1b[Ahelx\x7fp\r"],
    ["cat /workspace/rebuild-only.txt", undefined, 1],
    ["echo shell-created > shell.txt"],
    ["cat shell.txt"],
    ["echo alpha > alpha.txt"],
    ["echo Beta > beta.txt"],
    ["cat alpha.txt beta.txt > corpus.txt"],
    ["slop -c 'echo SLOP-C'"],
    ["slop -c 'cat <<EOF'", undefined, 2],
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
    ["sed s/Beta/Gamma/ corpus.txt > /tmp/sed-substitution.txt"],
    ["grep -q Gamma /tmp/sed-substitution.txt"],
    ["sed -n 2p corpus.txt > /tmp/sed-line.txt"],
    ["grep -q Beta /tmp/sed-line.txt"],
    ["echo SED-PIPE | sed s/SED/DOLLY/ > /tmp/sed-pipe.txt"],
    ["grep -q DOLLY-PIPE /tmp/sed-pipe.txt"],
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
    ["awk 'BEGIN {status = (\"printf AWK-PIPE\" | getline value); print status \":\" value; exit status == 1 && value == \"AWK-PIPE\" ? 0 : 1}'"],
    ["awk -f", undefined, 2],
    ...(hasRecipe("quickjs")
      ? [[`qjs -e 'Dolly.httpStart("GET", "${location.origin}/fixture/http.txt", "", null)'`]]
      : []),
    ["curl -fsSL /fixture/http.txt -o fetched.txt"],
    ["cat fetched.txt"],
    ["curl -sS -X POST -H 'X-Dolly-Cli: yes' -d one=1 -d two=2 " +
      "-D curl-headers.txt -o curl-body.txt " +
      "-w '%{http_code} %{content_type}\\n' /fixture/curl-options > curl-meta.txt"],
    ["grep -q '^CURL-CLI-OK$' curl-body.txt"],
    ["grep -qi '^x-dolly-response: yes' curl-headers.txt"],
    ["grep -q '^201 text/plain; charset=utf-8$' curl-meta.txt"],
    ["curl -f /fixture/missing", undefined, 22],
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
    ["ls /usr/lib/libghostty-vt.a"],
    ["test ! -e /usr/bin/ghostty-vt"],
    ["graphics-demo --frames 2", undefined,
      document.documentElement.dataset.image === "gamedev" ? 0 : 127],
    ["cc --version"],
    ["c++ --version"],
    ["echo \"int main(void) { volatile unsigned long n = 0; for (;;) n++; }\" > interrupt-loop.c"],
    ["cc -O0 interrupt-loop.c -o interrupt-loop"],
    ["ld --help"],
    ["ar --version"],
    ["cc --definitely-unsupported", undefined, 64],
    ["cat /bin/echo > invalid-module"],
    ["echo invalid >> invalid-module"],
    ["./invalid-module", undefined, 126],
    ["make --version"],
    ...(hasRecipe("quickjs") ? [
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
    ] : []),
    ...(hasRecipe("pi") ? [
      ["janis --version"],
      ["janis -e \"const c = process.getBuiltinModule('node:crypto'); if (c.createHash('sha256').update('abc').digest('hex') !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') process.exit(1); console.log('JANIS-HASH-OK')\""],
      ["janis -e \"const h = process.getBuiltinModule('node:http'); const s = new h.Server(); s.on('error', e => { if (e.code !== 'ENOSYS') process.exit(1); console.log('JANIS-LISTEN-ENOSYS'); }); s.listen(1455)\""],
      ["tsc --version"],
      ["echo 'export const browserAnswer: number = 6 * 7;' > browser-answer.ts"],
      ["tsc --target ES2023 --module ES2022 --outDir browser-ts browser-answer.ts"],
      ["qjs -m -e \"import { browserAnswer } from '/workspace/browser-ts/browser-answer.js'; if (browserAnswer !== 42) throw new Error('bad TypeScript emit')\""],
      ["janis -m -e \"import { defineTelemetrySchema } from '@earendil-works/pi-telemetry'; if (defineTelemetrySchema('BROWSER') !== 'BROWSER') throw new Error('bad target workspace package')\""],
      ["test -s /usr/src/pi-source/packages/coding-agent/dist-dolly/cli.js"],
      ["pi --version"],
      ["echo '{\"openrouter\":{\"type\":\"api_key\",\"key\":\"sandbox-placeholder\"},\"openai-codex\":{\"type\":\"oauth\",\"access\":\"sandbox-placeholder\",\"refresh\":\"sandbox-placeholder\",\"expires\":4102444800000}}' > /home/dolly/.pi/agent/auth.json"],
      ["pi --list-models openrouter > /tmp/pi-openrouter-models.txt"],
      ["grep -q 'openrouter' /tmp/pi-openrouter-models.txt"],
      ["pi --list-models openai-codex > /tmp/pi-codex-models.txt"],
      ["grep -q 'openai-codex' /tmp/pi-codex-models.txt"],
      ["rm -f /home/dolly/.pi/agent/auth.json"],
    ] : []),
  ];
  for (const [command, input] of beforeInteractive) {
    await submitInput(command, input ?? `${command}\r`);
  }
  const count = beforeInteractive.length;
  const proofResults = commandResults.slice(-count);
  const expectedStatuses = beforeInteractive.map((entry) => entry[2] ?? 0);
  const passed = proofResults.length === count
    && proofResults.every((result, index) => result.status === expectedStatuses[index]);
  if (!passed) {
    const mismatch = proofResults.findIndex(
      (result, index) => result.status !== expectedStatuses[index],
    );
    document.documentElement.dataset.dollyFailures = JSON.stringify(
      proofResults.flatMap((result, index) =>
        result.status === expectedStatuses[index]
          ? []
          : [{ index, command: result.command, actual: result.status,
              expected: expectedStatuses[index] }]),
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
  const packagedImages = new Set(DOLLY_IMAGES.map(({ image }) => image));
  if (configured === null || typeof configured !== "object" ||
      !(packagedImages.has(configured.image) || configured.image === "custom") ||
      !["snapshot", "rebuild"].includes(configured.mode) ||
      typeof configured.loadSession !== "boolean" ||
      (configured.image === "custom" && configured.mode !== "rebuild") ||
      (configured.loadSession && configured.mode !== "snapshot")) {
    throw new Error("invalid Dolly route configuration");
  }
  const bootMode = configured.mode;
  let image = configured.image;
  let restoredSession = null;
  let sessionSnapshot;
  if (configured.loadSession) {
    const name = new URL(location.href).searchParams.get("session");
    if (!validSessionName(name)) throw new Error("The Dolly session URL has an invalid name");
    restoredSession = await loadStoredSession(name);
    if (restoredSession === null) throw new Error(`Dolly session '${name}' was not found`);
    if (restoredSession.name !== name ||
        restoredSession.formatVersion !== DOLLY_SESSION_FORMAT_VERSION ||
        restoredSession.buildId !== DOLLY_BUILD_ID ||
        !packagedImages.has(restoredSession.image) ||
        restoredSession.imageIdentity !==
          sessionImageIdentity(DOLLY_IMAGES, restoredSession.image)) {
      throw new Error("The stored Dolly session does not match this runtime or image recipe");
    }
    image = restoredSession.image;
    sessionSnapshot = await decodeSessionSnapshot(restoredSession);
    currentSessionName = name;
  }
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
  appendBootstrap(`DOLLY / ${image.toUpperCase()} / ${restoredSession
    ? `RESTORE SESSION ${restoredSession.name}`
    : bootMode === "rebuild"
    ? "REBUILD FROM SOURCE"
    : "PRECOMPILED SYSTEM"}\n\n`);
  if (hardInterruptRecovery !== null) {
    const restoredCheckpoint = restoredSession !== null &&
      restoredSession.name === hardInterruptRecovery.session;
    document.documentElement.dataset.hardInterruptRecovery =
      restoredCheckpoint ? "session" : "base";
    appendBootstrap(
      `HARD INTERRUPT / ${restoredCheckpoint
        ? `RESTORING CHECKPOINT ${restoredSession.name}`
        : "RESETTING TO BASE IMAGE"}\n\n`,
    );
  }
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
    } else if (message.type === "entry-started") {
      document.documentElement.dataset.entryPid = String(message.pid);
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
      const detail = message.stack ? `${message.message}\n${message.stack}` : message.message;
      for (const reject of runtimeFailureRejectors) reject(new Error(detail));
      runtimeFailureRejectors.clear();
      displayFatal(detail);
    }
  });
  const workerConfiguration = {
    type: "configure",
    image,
    mode: bootMode,
    ...(customSource === undefined ? {} : { customSource }),
    ...(sessionSnapshot === undefined ? {} : { sessionSnapshot }),
  };
  runtimeWorker.postMessage(
    workerConfiguration,
    sessionSnapshot === undefined ? [] : [sessionSnapshot],
  );

  const ready = await new Promise((resolve, reject) => {
    runtimeWorker.addEventListener("message", function onMessage(event) {
      if (event.data.type === "ready") {
        runtimeWorker.removeEventListener("message", onMessage);
        resolve(event.data);
      } else if (event.data.type === "error") {
        runtimeWorker.removeEventListener("message", onMessage);
        const error = new Error(event.data.message);
        if (event.data.stack) error.stack = event.data.stack;
        reject(error);
      }
    });
    runtimeWorker.addEventListener("error", reject, { once: true });
  });
  appendBootstrap(bootstrapDecoder.decode(), true);
  runtimeReady = true;
  if (ready.version !== 4) throw new Error(`unsupported display mailbox ${ready.version}`);
  if (ready.httpVersion !== 2) throw new Error(`unsupported HTTP mailbox ${ready.httpVersion}`);
  if (ready.sessionVersion !== 1) {
    throw new Error(`unsupported session mailbox ${ready.sessionVersion}`);
  }
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
  sessionTransport = new SessionTransport(
    ready.memory,
    ready.sessionAddress,
    ready.sessionNameAddress,
    ready.sessionNameCapacity,
    ready.sessionTransferAddress,
    ready.sessionTransferCapacity,
    transport,
  );
  activeImage = ready.image;
  // Uploaded recipes exist only in this tab and have no source-visible,
  // restorable image identity. They can run normally, but named-session save
  // remains unavailable until custom recipes gain an explicit persistence
  // contract.
  activeImageIdentity = ready.routeImage === "custom"
    ? null
    : sessionImageIdentity(DOLLY_IMAGES, ready.image);
  if (restoredSession) {
    document.documentElement.dataset.session = restoredSession.name;
    document.documentElement.dataset.sessionStatus = "restored";
  }
  presenter = new FramebufferPresenter(
    canvas,
    ready.memory,
    ready.frameAddresses,
    ready.frameCapacity,
    transport,
  );
  presenter.start();
  if (!transport.pushResize(mount.clientWidth, mount.clientHeight, devicePixelRatio)) {
    throw new Error("Dolly display input ring rejected its initial resize");
  }
  runtimeWorker.postMessage({ type: "display-ready-ack" });
  bootstrapLog.hidden = true;
  canvas.hidden = false;
  document.documentElement.dataset.terminal = "ghostty-rgba-wasm";
  resizeObserver = new ResizeObserver(sendResize);
  resizeObserver.observe(mount);

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
    get sessionName() {
      return currentSessionName;
    },
    saveSession(name) {
      return saveCurrentSession(name);
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
  console.error(error);
  runtimeReady = false;
  networkTransport?.interrupt();
  presenter?.stop();
  resizeObserver?.disconnect();
  runtimeWorker?.terminate();
  displayFatal(error instanceof Error ? error.message : String(error));
});
