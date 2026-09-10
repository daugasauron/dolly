import { prepareImageArtifacts } from "./image-build.mjs";
import { buildImage } from "./image-builder.mjs";
import { mountImageBuild } from "./image-build-ui.mjs";
import { loadCustomImage } from "./custom-image.mjs";
import { consumeDollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "./http-policy.mjs";
import { NetworkTransport, DOLLY_HTTP_MAILBOX_VERSION } from "./http-broker.mjs";
import { localServicesTransport } from "./local-services.mjs";
import { mountLocalModel, toggleLocalModel } from "./local-model-ui.mjs";
import { SessionTransport } from "./session-transport.mjs";
import { UploadTransport, chooseUploadFile } from "./upload-transport.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION,
  decodeSessionSnapshot,
  encodeSessionSnapshot,
  loadStoredSession,
  saveStoredSession,
  sessionImageIdentity,
  sessionLoadUrl,
  validSessionName,
} from "./session-store.mjs";
import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";

const mount = document.querySelector("#terminal");
const canvas = document.querySelector("#display");
const keyboard = document.querySelector("#keyboard");
const bootstrapLog = document.querySelector("#bootstrap-log");
bootstrapLog.replaceChildren();

const defaultFontSizeMilli = 20000;
const bootstrapMaximumLines = 40;
const bootstrapMaximumCharacters = 8192;
const bootstrapLines = [];
let bootstrapCharacters = 0;
let bootstrapFragment = "";

const encoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
const bootstrapDecoder = new TextDecoder();
const runtimeFailureRejectors = new Set();

let runtimeWorker;
let transport;
let sessionTransport;
let uploadTransport;
let uploadTimer;
let networkTransport;
let presenter;
let resizeObserver;
let runtimeReady = false;
let builtSystemSnapshot = null;
let builtSystemInputs = null;
let rebuiltSessionBaseVerified = false;
let httpAdmission;
const maximumDownloadBytes = 64 * 1024 * 1024;
let downloadCount = 0;
let activeImage = null;
let activeImageIdentity = null;
let currentSessionName = null;
let sessionSavePromise = null;
let sessionSaveController = null;
let sessionStatusTimer;

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

function displayFatal(message) {
  clearInterval(uploadTimer);
  uploadTransport?.close();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  sessionSaveController?.abort(new Error("The runtime stopped; the previous save is unchanged"));
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
      flags: Math.max(0, Math.min(4, event.button ?? 0)) << 8,
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

  relativePointerRequested() {
    return this.graphicsActive() && this.cursorStyle() === 5;
  }

  pushPointerMotion(event) {
    const delta = value => Math.max(-32_768_000, Math.min(32_768_000, Math.round(value * 1000)));
    return this.pushRecord({ type: 8, width: delta(event.movementX), height: delta(event.movementY) });
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
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  updateCursor() {
    if (document.pointerLockElement === this.canvas && !this.transport.relativePointerRequested()) {
      document.exitPointerLock();
    }
    const styles = ["text", "default", "crosshair", "pointer", "none", "crosshair"];
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
    const record = complete.slice(offset, end)
      .replace(/\x1b\[[0-9;:]*m/g, "")
      .slice(-bootstrapMaximumCharacters);
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

function showSessionStatus(message, persistent = false) {
  const status = document.querySelector("#session-status");
  clearTimeout(sessionStatusTimer);
  status.textContent = message;
  status.hidden = false;
  if (!persistent) sessionStatusTimer = setTimeout(() => { status.hidden = true; }, 6000);
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
    if (builtSystemSnapshot !== null && !rebuiltSessionBaseVerified) {
      const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
        `../dist/dolly-${activeImage}-system-snapshot.mjs`);
      const digest = await crypto.subtle.digest("SHA-256", builtSystemSnapshot);
      const actual = [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (metadata.image !== activeImage || metadata.buildId !== DOLLY_BUILD_ID ||
          metadata.byteLength !== builtSystemSnapshot.byteLength || metadata.sha256 !== actual) {
        throw new Error("Rebuilt filesystem differs from the prebuilt session base; no session was saved");
      }
      rebuiltSessionBaseVerified = true;
    }
    let name = requestedName ?? currentSessionName;
    if (name === null) {
      name = window.prompt("Save Dolly session as:", "");
      if (name === null) return null;
      name = name.trim();
    }
    if (!validSessionName(name)) {
      throw new Error("Session names use 1-64 letters, numbers, '.', '_' or '-'; index.html is reserved");
    }
    if (name !== currentSessionName && await loadStoredSession(name) !== null &&
        !window.confirm(`Replace the saved session '${name}'?`)) return null;
    delete document.documentElement.dataset.sessionError;
    showSessionStatus(`Saving ${name}…`, true);
    document.documentElement.dataset.sessionStatus = "capturing";
    sessionSaveController = new AbortController();
    const snapshot = await sessionTransport.capture(name, { signal: sessionSaveController.signal });
    document.documentElement.dataset.sessionUncompressedBytes = String(snapshot.byteLength);
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
    history.replaceState(null, "", sessionLoadUrl(name, new URL("../", import.meta.url)));
    showSessionStatus(`Saved ${name} locally · /session lists your saves`);
    return name;
  })().catch((error) => {
    document.documentElement.dataset.sessionStatus = "failed";
    document.documentElement.dataset.sessionError =
      error instanceof Error ? error.message : String(error);
    showSessionStatus(`Save failed: ${document.documentElement.dataset.sessionError}`, true);
    throw error;
  }).finally(() => {
    sessionSavePromise = null;
    sessionSaveController = null;
  });
  return sessionSavePromise;
}

function requestForegroundInterrupt() {
  if (!transport) return false;
  const pid = transport.foregroundPid();
  if (pid <= 0 || !transport.foregroundInterruptible()) return false;
  if (!transport.interruptForeground()) return false;
  networkTransport?.interrupt();
  return true;
}

function handleKeyboardEvent(event) {
  if (document.querySelector("#file-upload[open]")) {
    if (event.type === "keydown" && event.ctrlKey && !event.shiftKey &&
        !event.altKey && !event.metaKey && event.code === "KeyC") {
      event.preventDefault();
      requestForegroundInterrupt();
    }
    return;
  }
  if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyL") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown" && !event.repeat) toggleLocalModel();
    return;
  }
  if (!transport) return;
  if (event.target.closest?.("#local-model, #image-build")) return;
  if (event.type === "keydown" && event.key === "Escape" && document.pointerLockElement === canvas) {
    document.exitPointerLock();
    event.preventDefault();
    return;
  }
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
  if (!transport || (event.button !== 0 && !transport.graphicsActive())) return;
  if (transport.relativePointerRequested()) {
    keyboard.blur();
    event.preventDefault();
    if (!event.isTrusted) return;
    if (document.pointerLockElement !== canvas) {
      const failed = error => { document.documentElement.dataset.pointerLockError = String(error); };
      try { void Promise.resolve(canvas.requestPointerLock()).catch(failed); }
      catch (error) { failed(error); }
    } else {
      pushPointer(event, 1);
    }
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  if (transport.graphicsActive()) keyboard.blur();
  else keyboard.focus({ preventScroll: true });
  selecting = true;
  pushPointer(event, 1);
  event.preventDefault();
});
canvas.addEventListener("pointermove", (event) => {
  if (document.pointerLockElement === canvas) {
    if (transport?.relativePointerRequested() && !transport.pushPointerMotion(event)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
    event.preventDefault();
    return;
  }
  if (!transport?.graphicsActive() && (!selecting || (event.buttons & 1) === 0)) return;
  pushPointer(event, 2);
  event.preventDefault();
});
canvas.addEventListener("pointerup", (event) => {
  if (!transport?.graphicsActive() && (!selecting || event.button !== 0)) return;
  selecting = false;
  pushPointer(event, 0);
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
});
canvas.addEventListener("contextmenu", event => {
  if (transport?.graphicsActive()) event.preventDefault();
});
canvas.addEventListener("pointercancel", (event) => {
  if (selecting) {
    selecting = false;
    pushPointer(event, 0);
  }
});
document.addEventListener("pointerlockchange", () => {
  selecting = false;
  const captured = document.pointerLockElement === canvas;
  document.documentElement.dataset.pointerLocked = String(captured);
  if (transport && !transport.pushRecord({ type: 9, action: captured ? 1 : 0 })) {
    document.documentElement.dataset.inputOverflow = "true";
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
  return commandStatus;
}

async function waitFor(predicate, description, attempts = 500) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function visibleTerminalText() {
  const geometry = transport.geometry();
  const dimensions = transport.dimensions();
  if (!geometry.cellWidth || !geometry.cellHeight ||
      !dimensions.cols || !dimensions.rows) return "";
  const x = geometry.paddingX + Math.floor(geometry.cellWidth / 4);
  const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
  const sequence = Atomics.load(transport.words,
    transport.word + DisplayTransport.copySequence);
  transport.pushPointer(x, y, 1, {});
  transport.pushPointer(x + (dimensions.cols - 1) * geometry.cellWidth,
    y + (dimensions.rows - 1) * geometry.cellHeight, 2, {});
  transport.pushPointer(x + (dimensions.cols - 1) * geometry.cellWidth,
    y + (dimensions.rows - 1) * geometry.cellHeight, 0, {});
  await waitFor(() => Atomics.load(transport.words,
    transport.word + DisplayTransport.copySequence) !== sequence,
  "terminal selection publication");
  return transport.copySelection() ?? "";
}

async function waitForInteractiveTerminal(pattern, description, previousPid = 0) {
  let pid;
  await waitFor(async () => {
    pid = transport.foregroundPid();
    if (pid <= 0 || pid === previousPid || transport.foregroundInterruptible() ||
        transport.graphicsActive() || !transport.inputIdle()) return false;
    const text = await visibleTerminalText();
    return transport.foregroundPid() === pid &&
      !transport.foregroundInterruptible() && pattern.test(text);
  }, description, 6000);
  const geometry = transport.geometry();
  const x = geometry.paddingX + Math.floor(geometry.cellWidth / 2);
  const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
  transport.pushPointer(x, y, 1, {});
  transport.pushPointer(x, y, 0, {});
  await waitFor(() => transport.inputIdle(), "terminal selection cleanup");
  return pid;
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
      (configured.loadSession && configured.mode !== "snapshot")) {
    throw new Error("invalid Dolly route configuration");
  }
  const bootMode = configured.mode;
  let image = configured.image;
  let restoredSession = null;
  let sessionSnapshot;
  if (configured.loadSession) {
    const name = decodeURIComponent(location.pathname.replace(/\/+$/, "").split("/").at(-1));
    if (!validSessionName(name)) throw new Error("The Dolly session URL has an invalid name");
    restoredSession = await loadStoredSession(name);
    if (restoredSession === null) throw new Error(`Session '${name}' was not found in this browser. Open /session to see saved sessions.`);
    if (restoredSession.name !== name ||
        restoredSession.formatVersion !== DOLLY_SESSION_FORMAT_VERSION ||
        restoredSession.buildId !== DOLLY_BUILD_ID ||
        !packagedImages.has(restoredSession.image) ||
        restoredSession.imageIdentity !==
          sessionImageIdentity(DOLLY_IMAGES, restoredSession.image)) {
      throw new Error("This save belongs to an older runtime or image recipe. It has not been deleted or overwritten. Open /session to see saved sessions.");
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
  let httpPolicy = consumeDollyHttpPolicy(
    window,
    trustedBootstrapSources,
    applicationBase,
  );
  if (image === "custom" && bootMode === "snapshot") {
    httpPolicy = restrictDollyHttpPolicy(httpPolicy, JSON.parse(sessionStorage.getItem("dolly-custom-policy")),
      trustedBootstrapSources, applicationBase);
  }
  const localModel = mountLocalModel();
  const buildNetwork = localServicesTransport(httpPolicy);
  const imageBuild = mountImageBuild(buildNetwork, httpPolicyConfigurations(httpPolicy));
  const applicationNetwork = localServicesTransport(httpPolicy, { model: localModel, build: imageBuild });
  const customSource = image === "custom"
    ? sessionStorage.getItem("dolly-custom-source")
    : undefined;
  if (image === "custom" && !customSource) {
    throw new Error("No uploaded Dollyfile is available in this tab. Return to the Dolly menu.");
  }
  const customArtifact = image === "custom" && bootMode === "snapshot"
    ? await loadCustomImage(customSource, JSON.parse(sessionStorage.getItem("dolly-custom-artifact"))) : undefined;
  appendBootstrap(`DOLLY / ${image.toUpperCase()} / ${restoredSession
    ? `RESTORE SESSION ${restoredSession.name}`
    : bootMode === "rebuild"
    ? "REBUILD FROM SOURCE"
    : "PRECOMPILED SYSTEM"}\n\n`);
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

  const buildDependency = (image, artifacts) => buildImage(image, artifacts, buildNetwork, appendBootstrap);
  const artifacts = bootMode === "rebuild"
    ? await prepareImageArtifacts(image, customSource, buildDependency, text => appendBootstrap(`${text}\n`)) : [];

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
      builtSystemInputs = message.inputs;
    } else if (message.type === "broker-ready") {
      try {
        if (networkTransport !== undefined || message.httpVersion !== DOLLY_HTTP_MAILBOX_VERSION) {
          throw new Error("Dolly supplied an invalid HTTP broker handshake");
        }
        if (!(message.httpAdmission instanceof SharedArrayBuffer) || message.httpAdmission.byteLength !== 8)
          throw new Error("invalid HTTP admission handshake");
        httpAdmission = new Int32Array(message.httpAdmission);
        networkTransport = new NetworkTransport(
          message.memory,
          message.httpAddress,
          message.httpCapacity,
          applicationNetwork.policy,
          { fetchRequest: applicationNetwork.fetchRequest },
        );
        runtimeWorker.postMessage({ type: "broker-ready-ack" });
      } catch (error) {
        displayFatal(error instanceof Error ? error.message : String(error));
      }
    } else if (message.type === "exited") {
      clearInterval(uploadTimer);
      uploadTransport?.close();
      document.documentElement.dataset.dollyStatus = "exited";
    } else if (message.type === "http-request") {
      void networkTransport.dispatch(message).then((result) => {
        Atomics.store(httpAdmission, 1, result);
        Atomics.store(httpAdmission, 0, 0);
        Atomics.notify(httpAdmission, 0);
      });
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
    artifacts,
    ...(customSource === undefined ? {} : { customSource }),
    ...(customArtifact === undefined ? {} : { customArtifact }),
    ...(sessionSnapshot === undefined ? {} : { sessionSnapshot }),
  };
  runtimeWorker.postMessage(
    workerConfiguration,
    [...artifacts.map(artifact => artifact.bytes), ...(sessionSnapshot === undefined ? [] : [sessionSnapshot]),
      ...(customArtifact === undefined ? [] : [customArtifact.bytes])],
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
  if (ready.version !== 5) throw new Error(`unsupported display mailbox ${ready.version}`);
  if (ready.httpVersion !== DOLLY_HTTP_MAILBOX_VERSION) throw new Error(`unsupported HTTP mailbox ${ready.httpVersion}`);
  if (ready.sessionVersion !== 2) {
    throw new Error(`unsupported session mailbox ${ready.sessionVersion}`);
  }
  if (ready.uploadVersion !== 0) throw new Error(`unsupported upload mailbox ${ready.uploadVersion}`);
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
  uploadTransport = new UploadTransport(ready.memory, ready.uploadAddress, chooseUploadFile);
  uploadTimer = setInterval(() => { void uploadTransport.poll(); }, 50);
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
    get systemInputs() {
      return builtSystemInputs;
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
    visibleTerminalText,
    waitForInteractiveTerminal,
    key(key, code, modifiers = 0) {
      return transport.pushSyntheticKey(key, code, modifiers);
    },
    get fontSize() {
      return transport.fontSize();
    },
  };
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
