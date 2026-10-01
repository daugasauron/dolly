import { instantiateKernelPlugin } from "../../src/kernel-plugin.mjs";
import { displayInput } from "./input.mjs";
export { DOLLY_DISPLAY_ABI_DIGEST as digest } from "./abi.mjs";

const encoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
const defaultFontSizeMilli = 20000;

export class DisplayTransport {
  static headerSize = 100;
  static eventRead = 0;
  static eventWrite = 1;
  static flags = 2;
  static frameSequence = 3;
  static frameIndex = 4;
  static frameWidth = 5;
  static frameHeight = 6;
  static frameStride = 7;
  static terminalCols = 8;
  static terminalRows = 9;
  static fontSizeMilli = 10;
  static pasteSequence = 11;
  static pasteConsumedSequence = 12;
  static pasteLength = 13;
  static copySequence = 14;
  static copyLength = 15;
  static copyFlags = 16;
  static cursorCol = 17;
  static cursorRow = 18;
  static cellWidth = 19;
  static cellHeight = 20;
  static paddingX = 21;
  static paddingY = 22;
  static animationFrameSequence = 23;
  static cursorStyle = 24;

  static keyEvent = 1;
  static textEvent = 2;
  static resizeEvent = 3;
  static focusEvent = 4;
  static pasteEvent = 5;
  static pointerEvent = 6;
  static scrollEvent = 7;
  static pointerMotionEvent = 8;
  static pointerCaptureEvent = 9;
  static pointerPresenceEvent = 10;

  static copyAvailable = 1;
  static copyTruncated = 2;

  constructor(buffer, address, eventSize, eventCapacity,
              pasteAddress, copyAddress, clipboardCapacity) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error("Dolly display transport requires shared Wasm memory");
    }
    const within = (start, length) => Number.isSafeInteger(start) && Number.isSafeInteger(length) &&
      start > 0 && length > 0 && start <= buffer.byteLength - length;
    if (address % 4 !== 0 || eventSize !== 128 || !Number.isSafeInteger(eventCapacity) ||
        eventCapacity <= 0 || (eventCapacity & (eventCapacity - 1)) !== 0 ||
        !within(address, DisplayTransport.headerSize + eventCapacity * eventSize) ||
        !within(pasteAddress, clipboardCapacity) || !within(copyAddress, clipboardCapacity)) {
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
    if (((write - read) >>> 0) >= this.eventCapacity) return false;

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

  // All or nothing: a partially delivered paste or command would be worse
  // than a visible refusal. This page is the sole producer, so free records
  // counted here cannot disappear before they are written.
  pushText(text) {
    const bytes = encoder.encode(text), chunks = [];
    for (let offset = 0; offset < bytes.length;) {
      let end = Math.min(offset + 88, bytes.length);
      while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
      chunks.push(textDecoder.decode(bytes.subarray(offset, end)));
      offset = end;
    }
    const read = Atomics.load(this.words, this.word + DisplayTransport.eventRead) >>> 0;
    const write = Atomics.load(this.words, this.word + DisplayTransport.eventWrite) >>> 0;
    if (chunks.length > this.eventCapacity - ((write - read) >>> 0)) return false;
    for (const chunk of chunks) this.pushRecord({ type: DisplayTransport.textEvent, text: chunk });
    return true;
  }

  pushPaste(text) {
    const bytes = encoder.encode(text);
    if (bytes.length > this.clipboardCapacity) return false;
    if (this.graphicsActive()) return this.pushText(text);
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
    return this.pushRecord({ type: DisplayTransport.pointerMotionEvent,
      width: delta(event.movementX), height: delta(event.movementY) });
  }

  pushFocus(focused) {
    return this.pushRecord({ type: DisplayTransport.focusEvent, action: focused ? 1 : 0 });
  }

  pushPointerCapture(captured) {
    return this.pushRecord({ type: DisplayTransport.pointerCaptureEvent, action: captured ? 1 : 0 });
  }

  pushPointerPresence(inside) {
    return this.pushRecord({ type: DisplayTransport.pointerPresenceEvent, action: inside ? 1 : 0 });
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

  inputIdle() {
    return Atomics.load(this.words, this.word + DisplayTransport.eventRead) ===
      Atomics.load(this.words, this.word + DisplayTransport.eventWrite);
  }

  graphicsActive() {
    return (Atomics.load(this.words, this.word + DisplayTransport.flags) & 1) !== 0;
  }

  publishAnimationFrame() {
    if (!this.graphicsActive()) return;
    Atomics.add(
      this.words,
      this.word + DisplayTransport.animationFrameSequence,
      1,
    );
  }

  cursorStyle() {
    return Atomics.load(
      this.words,
      this.word + DisplayTransport.cursorStyle,
    ) >>> 0;
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

export class FramebufferPresenter {
  constructor(canvasElement, buffer, frameAddresses, capacity, displayTransport, fatal) {
    this.canvas = canvasElement;
    this.context = canvasElement.getContext("2d", { alpha: false });
    if (!this.context) throw new Error("Dolly requires a 2D canvas context");
    this.buffer = buffer;
    this.frameAddresses = frameAddresses;
    this.capacity = capacity;
    this.transport = displayTransport;
    this.fatal = fatal;
    this.sequence = -1;
    this.running = true;
  }

  start() {
    const paint = () => {
      if (!this.running) return;
      try {
        this.transport.publishAnimationFrame();
        this.updateCursor();
        this.paint();
      } catch (error) {
        this.stop();
        this.fatal(error.message);
        return;
      }
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
      return;
    }
  }
}

export function browser(page) {
  const { canvas, fatal, get } = page;
  const input = displayInput(page);
  const terminal = () => get("runtime").terminal;
  let transport, presenter;
  // Submitted commands awaiting their shell result; disposal ends the wait.
  const waiting = new Set();

  async function waitFor(predicate, description, attempts = 500) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`timed out waiting for ${description}`);
  }

  async function submit(command, text = `${command}\r`) {
    const sequence = terminal().currentResultSequence();
    if (!transport.pushText(text)) throw new Error("Dolly input mailbox is full");
    let stop;
    const stopped = new Promise((_resolve, reject) => { stop = reject; waiting.add(stop); });
    return Promise.race([terminal().waitForResult(sequence), stopped]).finally(() => waiting.delete(stop));
  }

  // Selects the whole screen, reads the published selection, then clears it.
  async function visibleTerminalText() {
    const geometry = transport.geometry();
    const dimensions = transport.dimensions();
    if (!geometry.cellWidth || !geometry.cellHeight || !dimensions.cols || !dimensions.rows) return "";
    const x = geometry.paddingX + Math.floor(geometry.cellWidth / 4);
    const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
    const sequence = Atomics.load(transport.words, transport.word + DisplayTransport.copySequence);
    const endX = x + (dimensions.cols - 1) * geometry.cellWidth, endY = y + (dimensions.rows - 1) * geometry.cellHeight;
    transport.pushPointer(x, y, 1, {});
    transport.pushPointer(endX, endY, 2, {});
    transport.pushPointer(endX, endY, 0, {});
    await waitFor(() => Atomics.load(transport.words, transport.word + DisplayTransport.copySequence) !== sequence,
      "terminal selection publication");
    return transport.copySelection() ?? "";
  }

  // Resolves to the PID of a new foreground program in raw mode showing text
  // that matches pattern.
  async function waitForInteractiveTerminal(pattern, description, previousPid = 0) {
    let pid;
    await waitFor(async () => {
      pid = terminal().foregroundPid();
      if (pid <= 0 || pid === previousPid || terminal().foregroundInterruptible() ||
          transport.graphicsActive() || !transport.inputIdle()) return false;
      const text = await visibleTerminalText();
      return terminal().foregroundPid() === pid && !terminal().foregroundInterruptible() && pattern.test(text);
    }, description, 6000);
    const geometry = transport.geometry();
    const x = geometry.paddingX + Math.floor(geometry.cellWidth / 2);
    const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
    transport.pushPointer(x, y, 1, {});
    transport.pushPointer(x, y, 0, {});
    await waitFor(() => transport.inputIdle(), "terminal selection cleanup");
    return pid;
  }

  return {
    get transport() { return transport; },
    get presenter() { return presenter; },
    page: {
      get transport() { return transport; },
      get display() { return presenter; },
      get graphicsActive() { return transport.graphicsActive(); },
      get fontSize() { return transport.fontSize(); },
      submit, visibleTerminalText, waitForInteractiveTerminal,
      input: data => transport.pushText(data),
      paste: data => transport.pushPaste(data),
      copySelection: () => transport.copySelection(),
      key: (key, code, modifiers = 0) => transport.pushSyntheticKey(key, code, modifiers),
    },
    start(message) {
      transport = new DisplayTransport(message.memory, message.address, message.eventSize,
        message.eventCapacity, message.pasteAddress, message.copyAddress, message.clipboardCapacity);
      const capacity = message.frameCapacity, limit = message.memory.byteLength;
      if (message.version !== 6 || !Array.isArray(message.frameAddresses) ||
          message.frameAddresses.length !== 2 || !Number.isSafeInteger(capacity) || capacity <= 0 ||
          message.frameAddresses.some(address => !Number.isSafeInteger(address) || address <= 0 || address > limit - capacity)) {
        throw new Error("invalid display provider handshake");
      }
      presenter = new FramebufferPresenter(canvas, message.memory, message.frameAddresses,
        capacity, transport, fatal);
      presenter.start();
      input.connect(transport);
    },
    entryStarted() {
      input.followSize();
      canvas.hidden = false;
      document.documentElement.dataset.terminal = "ghostty-rgba-wasm";
    },
    dispose() {
      for (const stop of waiting) stop(new Error("Dolly stopped"));
      waiting.clear();
      presenter?.stop();
      input.dispose();
    },
  };
}

export function worker() {
  let kernel;
  return {
    service() {
      const status = kernel?._dolly_terminal_present_pending() ?? 0;
      if (status !== 0) throw new Error(`Dolly terminal presentation failed with status ${status}`);
    },
    start({ dolly, memory, kernelExports }) {
      kernel = dolly;
      if (dolly._dolly_display_prepare() !== 0) throw new Error("Dolly display preparation failed");
      const address = Number(dolly._dolly_display_module_address()), size = Number(dolly._dolly_display_module_size());
      if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) || address <= 0 ||
          size <= 0 || size > 64 * 1024 * 1024 || address > memory.buffer.byteLength - size) {
        throw new Error("invalid resident display plugin range");
      }
      const display = instantiateKernelPlugin(new Uint8Array(memory.buffer, address, size).slice(), kernelExports, memory);
      const getDriver = display.exports.dolly_display_driver_get_v3;
      if (typeof getDriver !== "function" || dolly._dolly_display_install(getDriver()) !== 0) {
        throw new Error("Dolly display installation failed");
      }
      return { memory: memory.buffer, address: Number(dolly._dolly_display_mailbox_address()),
        eventSize: dolly._dolly_display_event_size(), eventCapacity: dolly._dolly_display_event_capacity(),
        version: dolly._dolly_display_mailbox_version(),
        frameAddresses: [0, 1].map(index => Number(dolly._dolly_display_framebuffer_address(index))),
        frameCapacity: Number(dolly._dolly_display_framebuffer_capacity()),
        pasteAddress: Number(dolly._dolly_display_paste_buffer_address()),
        copyAddress: Number(dolly._dolly_display_copy_buffer_address()), clipboardCapacity: dolly._dolly_display_clipboard_capacity() };
    },
  };
}
