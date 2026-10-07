import { instantiateKernelPlugin } from "../../src/kernel-plugin.mjs";
import { displayInput } from "./input.mjs";
import * as A from "./abi.mjs";
export { DOLLY_DISPLAY_ABI_DIGEST as digest } from "./abi.mjs";

const encoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
const defaultFontSizeMilli = 20000;
const cursorStyles = ["text", "default", "crosshair", "pointer", "none", "crosshair"];
// The presenter keeps requesting animation frames this long after the last
// frame or input, so an echo is painted on the frame after it is published.
const lingerMilliseconds = 250;
// A record's strings are encoded here: TextEncoder does not write shared memory.
const recordData = new Uint8Array(A.DOLLY_DISPLAY_EVENT_DATA_SIZE);

// Appends value's UTF-8 to recordData; returns the new length, or -1 when the
// record's strings do not fit.
function appendString(value, length) {
  if (length < 0 || value === "") return length;
  const { read, written } = encoder.encodeInto(value, recordData.subarray(length));
  return read === value.length ? length + written : -1;
}

// The largest relative motion of one record, in thousandths of a CSS pixel.
const clampMotion = value => Math.max(-32_768_000, Math.min(32_768_000, value));

export class DisplayTransport {
  static headerSize = A.DOLLY_DISPLAY_HEADER_SIZE;
  static eventRead = A.DOLLY_DISPLAY_WORD_EVENT_READ;
  static eventWrite = A.DOLLY_DISPLAY_WORD_EVENT_WRITE;
  static flags = A.DOLLY_DISPLAY_WORD_FLAGS;
  static frameSequence = A.DOLLY_DISPLAY_WORD_FRAME_SEQUENCE;
  static frameIndex = A.DOLLY_DISPLAY_WORD_FRAME_INDEX;
  static frameWidth = A.DOLLY_DISPLAY_WORD_FRAME_WIDTH;
  static frameHeight = A.DOLLY_DISPLAY_WORD_FRAME_HEIGHT;
  static frameStride = A.DOLLY_DISPLAY_WORD_FRAME_STRIDE;
  static terminalCols = A.DOLLY_DISPLAY_WORD_TERMINAL_COLS;
  static terminalRows = A.DOLLY_DISPLAY_WORD_TERMINAL_ROWS;
  static fontSizeMilli = A.DOLLY_DISPLAY_WORD_FONT_SIZE_MILLI;
  static pasteSequence = A.DOLLY_DISPLAY_WORD_PASTE_SEQUENCE;
  static pasteConsumedSequence = A.DOLLY_DISPLAY_WORD_PASTE_CONSUMED_SEQUENCE;
  static pasteLength = A.DOLLY_DISPLAY_WORD_PASTE_LENGTH;
  static copySequence = A.DOLLY_DISPLAY_WORD_COPY_SEQUENCE;
  static copyLength = A.DOLLY_DISPLAY_WORD_COPY_LENGTH;
  static copyFlags = A.DOLLY_DISPLAY_WORD_COPY_FLAGS;
  static cursorCol = A.DOLLY_DISPLAY_WORD_CURSOR_COL;
  static cursorRow = A.DOLLY_DISPLAY_WORD_CURSOR_ROW;
  static cellWidth = A.DOLLY_DISPLAY_WORD_CELL_WIDTH;
  static cellHeight = A.DOLLY_DISPLAY_WORD_CELL_HEIGHT;
  static paddingX = A.DOLLY_DISPLAY_WORD_PADDING_X;
  static paddingY = A.DOLLY_DISPLAY_WORD_PADDING_Y;
  static animationFrameSequence = A.DOLLY_DISPLAY_WORD_ANIMATION_FRAME_SEQUENCE;
  static cursorStyle = A.DOLLY_DISPLAY_WORD_CURSOR_STYLE;

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

  // The ring and clipboard sizes are the contract's; a test may shrink them.
  // sent() follows every record written; dropped(count) reports every record
  // the ring had no room for.
  constructor(buffer, address, pasteAddress, copyAddress, { eventCapacity = A.DOLLY_DISPLAY_EVENT_CAPACITY,
    clipboardCapacity = A.DOLLY_DISPLAY_CLIPBOARD_CAPACITY, sent = () => {}, dropped = () => {} } = {}) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error("Dolly display transport requires shared Wasm memory");
    }
    const within = (start, length) => Number.isSafeInteger(start) && Number.isSafeInteger(length) &&
      start > 0 && length > 0 && start <= buffer.byteLength - length;
    if (address % 4 !== 0 || !Number.isSafeInteger(eventCapacity) ||
        eventCapacity <= 0 || (eventCapacity & (eventCapacity - 1)) !== 0 ||
        !within(address, DisplayTransport.headerSize + eventCapacity * A.DOLLY_DISPLAY_EVENT_SIZE) ||
        !within(pasteAddress, clipboardCapacity) || !within(copyAddress, clipboardCapacity)) {
      throw new Error("Dolly supplied an invalid display mailbox");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.view = new DataView(buffer);
    this.sent = sent;
    this.dropped = dropped;
    this.droppedRecords = 0;
    this.movementX = 0;
    this.movementY = 0;
    this.position = null;
    this.motionScheduled = false;
    this.address = address;
    this.word = address / 4;
    this.eventSize = A.DOLLY_DISPLAY_EVENT_SIZE;
    this.eventCapacity = eventCapacity;
    this.pasteAddress = pasteAddress;
    this.copyAddress = copyAddress;
    this.clipboardCapacity = clipboardCapacity;
  }

  // Free ring slots. This page is the ring's one producer, so they stay free
  // until it writes.
  freeRecords() {
    const read = Atomics.load(this.words, this.word + DisplayTransport.eventRead) >>> 0;
    const write = Atomics.load(this.words, this.word + DisplayTransport.eventWrite) >>> 0;
    return this.eventCapacity - ((write - read) >>> 0);
  }

  // Writes one record if the ring has room and the record's strings fit.
  writeRecord({ type, action = 0, modifiers = 0, flags = 0, width = 0, height = 0, scaleMilli = 0,
    fontSizeMilli = 0, key = "", code = "", text = "" }) {
    const keyEnd = appendString(key, 0), codeEnd = appendString(code, keyEnd), textEnd = appendString(text, codeEnd);
    if (textEnd < 0 || this.freeRecords() <= 0) return false;
    const write = Atomics.load(this.words, this.word + DisplayTransport.eventWrite) >>> 0;
    const offset = this.address + DisplayTransport.headerSize +
      (write & (this.eventCapacity - 1)) * this.eventSize;
    const view = this.view;
    view.setUint32(offset, type, true);
    view.setUint32(offset + 4, action, true);
    view.setUint32(offset + 8, modifiers, true);
    view.setUint32(offset + 12, flags, true);
    view.setUint32(offset + 16, width, true);
    view.setUint32(offset + 20, height, true);
    view.setUint32(offset + 24, scaleMilli, true);
    view.setUint32(offset + 28, fontSizeMilli, true);
    view.setUint16(offset + 32, keyEnd, true);
    view.setUint16(offset + 34, codeEnd - keyEnd, true);
    view.setUint16(offset + 36, textEnd - codeEnd, true);
    view.setUint16(offset + 38, 0, true);
    recordData.fill(0, textEnd);
    this.bytes.set(recordData, offset + 40);

    Atomics.store(this.words, this.word + DisplayTransport.eventWrite, (write + 1) | 0);
    // Wakes the record's reader (worker().start): a graphics program reads
    // every record, the terminal's reader keys, text and paste. The terminal
    // handles its own pointer, scroll and resize records on its service tick,
    // all of them before it draws one frame.
    if (this.graphicsActive() || (type !== DisplayTransport.pointerEvent &&
        type !== DisplayTransport.scrollEvent && type !== DisplayTransport.resizeEvent)) {
      Atomics.notify(this.words, this.word + DisplayTransport.eventWrite);
    }
    this.sent();
    return true;
  }

  // The ring is the only queue of input, so a record it has no room for is
  // lost. It is counted and reported, never dropped silently.
  refuse() {
    this.dropped(++this.droppedRecords);
    return false;
  }

  pushRecord(record) {
    this.flushMotion(1);
    return this.writeRecord(record) || this.refuse();
  }

  // Pointer motion is a sample, not an event: relative deltas add up and the
  // newest position replaces an unsent one. The sample is sent once per
  // animation frame while more than half the ring is free, and ahead of any
  // other record that leaves room for both. So motion never takes a key's
  // slot, and a program that does not read delays it but never loses it.
  flushMotion(reserve) {
    if ((this.movementX || this.movementY) && this.freeRecords() > reserve) {
      const width = clampMotion(this.movementX), height = clampMotion(this.movementY);
      this.writeRecord({ type: DisplayTransport.pointerMotionEvent, width, height });
      this.movementX -= width;
      this.movementY -= height;
    }
    if (this.position && this.freeRecords() > reserve) {
      this.writeRecord(this.position);
      this.position = null;
    }
  }

  scheduleMotion() {
    if (this.motionScheduled) return;
    this.motionScheduled = true;
    requestAnimationFrame(() => {
      this.motionScheduled = false;
      this.flushMotion(this.eventCapacity / 2);
      if (this.movementX || this.movementY || this.position) this.scheduleMotion();
    });
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
    this.flushMotion(chunks.length);
    if (chunks.length > this.freeRecords()) return this.refuse();
    for (const chunk of chunks) this.writeRecord({ type: DisplayTransport.textEvent, text: chunk });
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

    // The record must follow its bytes; the caller reports a paste that is not delivered.
    this.flushMotion(1);
    if (this.freeRecords() <= 0) return false;
    this.bytes.set(bytes, this.pasteAddress);
    Atomics.store(this.words, this.word + DisplayTransport.pasteLength, bytes.length);
    Atomics.store(
      this.words,
      this.word + DisplayTransport.pasteSequence,
      (published + 1) | 0,
    );
    return this.writeRecord({ type: DisplayTransport.pasteEvent });
  }

  pushPointer(x, y, action, event) {
    let modifiers = 0;
    if (event.shiftKey) modifiers |= 1;
    if (event.ctrlKey) modifiers |= 2;
    if (event.altKey) modifiers |= 4;
    if (event.metaKey) modifiers |= 8;
    const record = {
      type: DisplayTransport.pointerEvent,
      action,
      modifiers,
      flags: Math.max(0, Math.min(4, event.button ?? 0)) << 8,
      width: Math.max(0, Math.round(x)),
      height: Math.max(0, Math.round(y)),
    };
    if (action !== 2) return this.pushRecord(record);
    this.position = record;
    this.scheduleMotion();
    return true;
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
    this.movementX += Math.round(event.movementX * 1000);
    this.movementY += Math.round(event.movementY * 1000);
    this.scheduleMotion();
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
    // Not counted when refused: the caller retries with the newest size.
    return this.writeRecord({
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
    Atomics.add(this.words, this.word + DisplayTransport.animationFrameSequence, 1);
    Atomics.notify(this.words, this.word + DisplayTransport.animationFrameSequence);
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

  // Paints once per animation frame while frames arrive, a program owns the
  // display or input is sent (wake). After lingerMilliseconds without any of
  // these it requests no frames and waits on the frame sequence: the Worker
  // notifies it of a new frame, lease or cursor (worker().service).
  start() {
    const { words, word } = this.transport;
    let requested = false, waiting = false, activeUntil = 0;
    const frame = now => {
      requested = false;
      if (!this.running) return;
      try {
        this.transport.publishAnimationFrame();
        this.updateCursor();
        if (this.paint() || this.transport.graphicsActive()) activeUntil = now + lingerMilliseconds;
      } catch (error) {
        this.stop();
        this.fatal(error.message);
        return;
      }
      if (now < activeUntil) return request();
      // One wait at a time: any notify after it began ends it.
      if (!waiting) {
        const parked = Atomics.waitAsync(words, word + DisplayTransport.frameSequence, this.sequence | 0);
        waiting = parked.async;
        if (waiting) parked.value.then(() => { waiting = false; this.wake(); });
        else this.wake();
      }
      // A lease or cursor set before the wait began was notified to nobody.
      if (this.transport.graphicsActive() || this.transport.cursorStyle() !== this.cursor) this.wake();
    };
    const request = () => {
      if (requested || !this.running) return;
      requested = true;
      requestAnimationFrame(frame);
    };
    this.wake = () => {
      activeUntil = performance.now() + lingerMilliseconds;
      request();
    };
    // A capture granted after its program stopped asking is released by the next frame.
    document.addEventListener("pointerlockchange", this.wake);
    this.wake();
  }

  stop() {
    this.running = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  updateCursor() {
    if (document.pointerLockElement === this.canvas && !this.transport.relativePointerRequested()) {
      document.exitPointerLock();
    }
    const cursor = this.transport.cursorStyle();
    if (cursor === this.cursor) return;
    this.cursor = cursor;
    this.canvas.style.cursor = cursorStyles[cursor] ?? "default";
  }

  // Copies a newly published frame to the canvas; returns whether it painted one.
  paint() {
    const { words, word } = this.transport;
    const sequence = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
    if (sequence === this.sequence) return false;
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
      // One image, and one view of each frame buffer, per frame size: a frame
      // costs one copy out of shared memory and allocates nothing.
      if (this.image?.width !== width || this.image.height !== height) {
        this.image = new ImageData(width, height);
        this.frames = [];
      }
      this.image.data.set(this.frames[index] ??= new Uint8ClampedArray(this.buffer, address, length));
      const after = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
      if (before !== after) continue;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.context.putImageData(this.image, 0, 0);
      this.sequence = after;
      const dataset = document.documentElement.dataset;
      dataset.frameSequence = after;
      const cols = Atomics.load(words, word + DisplayTransport.terminalCols);
      const rows = Atomics.load(words, word + DisplayTransport.terminalRows);
      if (cols !== this.cols) dataset.terminalCols = this.cols = cols;
      if (rows !== this.rows) dataset.terminalRows = this.rows = rows;
      return true;
    }
    return false;
  }
}

export function browser(page) {
  const { canvas, fatal, showStatus, get } = page;
  const input = displayInput(page);
  const terminal = () => get("runtime").terminal;
  let transport, presenter;
  // Submitted commands awaiting their shell result; disposal ends the wait.
  const waiting = new Set();

  // Resolves to true once predicate holds. When it never does, throws naming
  // description, or resolves to false without one.
  async function waitFor(predicate, description, attempts = 500) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (await predicate()) return true;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (description) throw new Error(`timed out waiting for ${description}`);
    return false;
  }

  async function submit(command, text = `${command}\r`) {
    const sequence = terminal().currentResultSequence();
    if (!transport.pushText(text)) throw new Error("Dolly input mailbox is full");
    let stop;
    const stopped = new Promise((_resolve, reject) => { stop = reject; waiting.add(stop); });
    return Promise.race([terminal().waitForResult(sequence), stopped]).finally(() => waiting.delete(stop));
  }

  // Selects the whole screen and reads the published selection. The press
  // drops an earlier selection, so the text read after it is this one's. A
  // program that enters or leaves the alternate screen between the press and
  // the drag leaves the gesture without a selection (an editor exiting), so
  // the gesture is made again, each time with a longer wait: a slow frame is
  // not a broken gesture.
  async function visibleTerminalText() {
    for (const attempts of [25, 50, 100, 325]) {
      const geometry = transport.geometry();
      const dimensions = transport.dimensions();
      if (!geometry.cellWidth || !geometry.cellHeight || !dimensions.cols || !dimensions.rows) return "";
      const x = geometry.paddingX + Math.floor(geometry.cellWidth / 4);
      const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
      const endX = x + (dimensions.cols - 1) * geometry.cellWidth, endY = y + (dimensions.rows - 1) * geometry.cellHeight;
      let selected;
      transport.pushPointer(x, y, 1, {});
      await waitFor(() => transport.copySelection() === null, "terminal selection reset");
      transport.pushPointer(endX, endY, 2, {});
      transport.pushPointer(endX, endY, 0, {});
      if (await waitFor(() => (selected = transport.copySelection()) !== null, null, attempts)) return selected;
    }
    throw new Error("timed out waiting for terminal selection publication");
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
    page: {
      get transport() { return transport; },
      get graphicsActive() { return transport.graphicsActive(); },
      get fontSize() { return transport.fontSize(); },
      submit, visibleTerminalText, waitForInteractiveTerminal,
      input: data => transport.pushText(data),
      paste: data => transport.pushPaste(data),
      copySelection: () => transport.copySelection(),
      key: (key, code, modifiers = 0) => transport.pushSyntheticKey(key, code, modifiers),
    },
    start(message) {
      transport = new DisplayTransport(message.memory, message.address, message.pasteAddress, message.copyAddress, {
        sent: () => presenter.wake(),
        dropped(count) {
          document.documentElement.dataset.inputDropped = count;
          showStatus("Input dropped: the program is not reading it");
        },
      });
      const capacity = A.DOLLY_DISPLAY_MAX_WIDTH * A.DOLLY_DISPLAY_MAX_HEIGHT * 4, limit = message.memory.byteLength;
      if (!Array.isArray(message.frameAddresses) || message.frameAddresses.length !== A.DOLLY_DISPLAY_FRAME_COUNT ||
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
      // What the image published last stays on screen once it has ended.
      try { presenter?.paint(); } catch {}
      presenter?.stop();
      input.dispose();
    },
  };
}

export function worker({ get }) {
  let kernel, words, word, seen = {};
  // The page notifies the words it writes: a program waiting for input or for
  // the animation frame resumes then, not at the next service tick.
  function resumeWhenNotified(field) {
    const index = word + field;
    const wait = () => Promise.resolve(Atomics.waitAsync(words, index, Atomics.load(words, index)).value)
      .then(() => { get("runtime").serviceDeferred(); wait(); });
    wait();
  }
  return {
    service() {
      if (!kernel) return;
      const status = kernel._dolly_terminal_present_pending();
      if (status !== 0) throw new Error(`Dolly terminal presentation failed with status ${status}`);
      // Wakes the page's presenter, which waits on the frame sequence while idle.
      const frame = Atomics.load(words, word + A.DOLLY_DISPLAY_WORD_FRAME_SEQUENCE);
      const flags = Atomics.load(words, word + A.DOLLY_DISPLAY_WORD_FLAGS);
      const cursor = Atomics.load(words, word + A.DOLLY_DISPLAY_WORD_CURSOR_STYLE);
      if (frame === seen.frame && flags === seen.flags && cursor === seen.cursor) return;
      seen = { frame, flags, cursor };
      Atomics.notify(words, word + A.DOLLY_DISPLAY_WORD_FRAME_SEQUENCE);
    },
    start({ dolly, memory, kernelExports }) {
      if (dolly._dolly_display_prepare() !== 0) throw new Error("Dolly display preparation failed");
      const address = Number(dolly._dolly_display_module_address()), size = Number(dolly._dolly_display_module_size());
      if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) || address <= 0 ||
          size <= 0 || size > 64 * 1024 * 1024 || address > memory.buffer.byteLength - size) {
        throw new Error("invalid resident display plugin range");
      }
      const display = instantiateKernelPlugin(new Uint8Array(memory.buffer, address, size).slice(), kernelExports, memory);
      const getDriver = display.exports.dolly_display_driver_get_v4;
      if (typeof getDriver !== "function" || dolly._dolly_display_install(getDriver()) !== 0) {
        throw new Error("Dolly display installation failed");
      }
      const mailbox = Number(dolly._dolly_display_mailbox_address());
      words = new Int32Array(memory.buffer);
      word = mailbox / 4;
      kernel = dolly;
      resumeWhenNotified(A.DOLLY_DISPLAY_WORD_EVENT_WRITE);
      resumeWhenNotified(A.DOLLY_DISPLAY_WORD_ANIMATION_FRAME_SEQUENCE);
      return { memory: memory.buffer, address: mailbox,
        frameAddresses: [0, 1].map(index => Number(dolly._dolly_display_framebuffer_address(index))),
        pasteAddress: Number(dolly._dolly_display_paste_buffer_address()),
        copyAddress: Number(dolly._dolly_display_copy_buffer_address()) };
    },
  };
}
