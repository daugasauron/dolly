import * as A from "./abi.mjs";
export { DOLLY_DISPLAY_ABI_DIGEST as digest } from "./abi.mjs";

const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
// dolly_display_cursor (display.h), by value: the page's own cursors, nothing a guest draws.
const cursorStyles = ["text", "default", "crosshair", "pointer", "none", "ns-resize", "ew-resize", "nwse-resize",
  "nesw-resize", "move", "wait", "progress", "not-allowed", "help"];
// The presenter keeps requesting animation frames this long after the last
// frame, so the next one is painted on the frame after it is published.
const lingerMilliseconds = 250;

// The Worker's end of the display mailbox: it reads frames, the terminal's
// geometry and its selection, and writes the surface and the animation frame.
export class DisplayTransport {
  static flags = A.DOLLY_DISPLAY_WORD_FLAGS;
  static frameSequence = A.DOLLY_DISPLAY_WORD_FRAME_SEQUENCE;
  static frameIndex = A.DOLLY_DISPLAY_WORD_FRAME_INDEX;
  static frameWidth = A.DOLLY_DISPLAY_WORD_FRAME_WIDTH;
  static frameHeight = A.DOLLY_DISPLAY_WORD_FRAME_HEIGHT;
  static frameStride = A.DOLLY_DISPLAY_WORD_FRAME_STRIDE;
  static terminalCols = A.DOLLY_DISPLAY_WORD_TERMINAL_COLS;
  static terminalRows = A.DOLLY_DISPLAY_WORD_TERMINAL_ROWS;
  static fontSizeMilli = A.DOLLY_DISPLAY_WORD_FONT_SIZE_MILLI;
  static copySequence = A.DOLLY_DISPLAY_WORD_COPY_SEQUENCE;
  static copyLength = A.DOLLY_DISPLAY_WORD_COPY_LENGTH;
  static copyFlags = A.DOLLY_DISPLAY_WORD_COPY_FLAGS;
  static cursorCol = A.DOLLY_DISPLAY_WORD_CURSOR_COL;
  static cursorRow = A.DOLLY_DISPLAY_WORD_CURSOR_ROW;
  static cellWidth = A.DOLLY_DISPLAY_WORD_CELL_WIDTH;
  static cellHeight = A.DOLLY_DISPLAY_WORD_CELL_HEIGHT;
  static paddingX = A.DOLLY_DISPLAY_WORD_PADDING_X;
  static paddingY = A.DOLLY_DISPLAY_WORD_PADDING_Y;
  static cursorStyle = A.DOLLY_DISPLAY_WORD_CURSOR_STYLE;
  static animationFrameSequence = A.DOLLY_DISPLAY_WORD_ANIMATION_FRAME_SEQUENCE;
  static surfaceSequence = A.DOLLY_DISPLAY_WORD_SURFACE_SEQUENCE;
  static surfaceWidth = A.DOLLY_DISPLAY_WORD_SURFACE_WIDTH;
  static surfaceHeight = A.DOLLY_DISPLAY_WORD_SURFACE_HEIGHT;
  static surfaceScaleMilli = A.DOLLY_DISPLAY_WORD_SURFACE_SCALE_MILLI;

  static copyAvailable = 1;
  static copyTruncated = 2;

  // The copy buffer's size is the contract's; a test may shrink it.
  constructor(buffer, address, copyAddress, { copyCapacity = A.DOLLY_DISPLAY_COPY_CAPACITY } = {}) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error("Dolly display transport requires shared Wasm memory");
    }
    const within = (start, length) => Number.isSafeInteger(start) && Number.isSafeInteger(length) &&
      start > 0 && length > 0 && start <= buffer.byteLength - length;
    if (address % 4 !== 0 || !within(address, A.DOLLY_DISPLAY_MAILBOX_SIZE) || !within(copyAddress, copyCapacity)) {
      throw new Error("Dolly supplied an invalid display mailbox");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.word = address / 4;
    this.copyAddress = copyAddress;
    this.copyCapacity = copyCapacity;
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
          length > this.copyCapacity) {
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

  // The surface frames are shown on: the terminal lays its grid out for it.
  publishSurface(width, height, devicePixelRatio) {
    Atomics.add(this.words, this.word + DisplayTransport.surfaceSequence, 1);
    Atomics.store(this.words, this.word + DisplayTransport.surfaceWidth, Math.max(1, Math.round(width)));
    Atomics.store(this.words, this.word + DisplayTransport.surfaceHeight, Math.max(1, Math.round(height)));
    Atomics.store(this.words, this.word + DisplayTransport.surfaceScaleMilli,
      Math.max(500, Math.min(4000, Math.round(devicePixelRatio * 1000))));
    Atomics.add(this.words, this.word + DisplayTransport.surfaceSequence, 1);
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

// Paints the published frames on the page's canvas, from the Worker (an
// OffscreenCanvas). painted(sequence) follows each frame painted, cursor(style)
// each change of the pointer's cursor.
export class FramebufferPresenter {
  constructor(surface, buffer, frameAddresses, capacity, displayTransport, { fatal, painted, cursor }) {
    this.context = surface.getContext("2d", { alpha: false });
    if (!this.context) throw new Error("Dolly requires a 2D canvas context");
    this.surface = surface;
    this.buffer = buffer;
    this.frameAddresses = frameAddresses;
    this.capacity = capacity;
    this.transport = displayTransport;
    this.fatal = fatal;
    this.painted = painted;
    this.cursor = cursor;
    this.cursorStyle = undefined;
    this.sequence = -1;
    this.running = true;
  }

  // Paints once per animation frame while frames arrive or a program owns the
  // display. After lingerMilliseconds without either it requests no frames
  // and waits on the frame sequence: worker().service notifies it of a new
  // frame, lease or cursor.
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
      if (this.transport.graphicsActive() || this.transport.cursorStyle() !== this.cursorStyle) this.wake();
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
    this.wake();
  }

  stop() {
    this.running = false;
  }

  updateCursor() {
    const cursor = this.transport.cursorStyle();
    if (cursor === this.cursorStyle) return;
    this.cursor(this.cursorStyle = cursor);
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
      if (this.surface.width !== width || this.surface.height !== height) {
        this.surface.width = width;
        this.surface.height = height;
      }
      this.context.putImageData(this.image, 0, 0);
      this.sequence = after;
      this.painted(after);
      return true;
    }
    return false;
  }
}

// The page's display: the canvas, handed to the Worker that paints it, the
// surface it measures, and the copy chord. What the terminal publishes (its
// grid, geometry, cursor, the lease) the Worker reports by message.
export function browser({ mount, canvas, keyboard, fatal, showStatus, send, ask }) {
  const surface = canvas.transferControlToOffscreen();
  let state, resizeObserver;
  const publishSurface = () => send({ type: "display-surface", width: mount.clientWidth, height: mount.clientHeight,
    devicePixelRatio });
  const copySelection = () => ask({ type: "display-copy" });

  // Ctrl+Shift+C writes the terminal's selection to the clipboard.
  async function copyToClipboard() {
    try {
      const text = await copySelection();
      if (text === null) {
        document.documentElement.dataset.clipboard = "empty";
        return;
      }
      await navigator.clipboard.writeText(text).then(
        () => { document.documentElement.dataset.clipboard = "copied"; },
        () => { document.documentElement.dataset.clipboard = "denied"; },
      );
    } catch (error) {
      document.documentElement.dataset.clipboard = "failed";
      showStatus(`Copy failed: ${error.message}`);
    }
  }

  const transport = {
    graphicsActive: () => state.graphicsActive,
    cursorStyle: () => state.cursor,
    fontSize: () => state.fontSize,
    dimensions: () => ({ cols: state.cols, rows: state.rows }),
    geometry: () => state.geometry,
    copySelection,
  };
  return {
    configuration: { canvas: surface }, transfers: [surface],
    page: {
      get transport() { return state && transport; },
      get graphicsActive() { return state.graphicsActive; },
      get fontSize() { return state.fontSize; },
      copySelection,
    },
    // The copy chord is the page's: the guest reads neither its press nor its
    // release. A key typed into a module's own UI is that module's to claim.
    claimsKey(event) {
      if (!state || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey ||
          event.code !== "KeyC" || ![keyboard, document.body].includes(event.target)) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown") void copyToClipboard();
      return "key";
    },
    messages: {
      "display-state"(message) {
        const dataset = document.documentElement.dataset;
        if (message.cursor !== state?.cursor) canvas.style.cursor = cursorStyles[message.cursor] ?? "default";
        if (message.frame !== state?.frame) dataset.frameSequence = message.frame;
        if (message.cols !== state?.cols) dataset.terminalCols = message.cols;
        if (message.rows !== state?.rows) dataset.terminalRows = message.rows;
        state = message;
      },
      "display-failed"({ message }) { fatal(message); },
      // The last frame stays on screen once the image has ended, behind the
      // canvas whose Worker is gone.
      "display-ended"({ image }) {
        const kept = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
        kept.getContext("2d").putImageData(image, 0, 0);
        kept.toBlob(blob => {
          if (blob) canvas.style.background = `url(${URL.createObjectURL(blob)}) left top / contain no-repeat`;
        });
      },
    },
    // The initial surface, then every change of the terminal area.
    entryStarted() {
      publishSurface();
      resizeObserver = new ResizeObserver(publishSurface);
      resizeObserver.observe(mount);
      canvas.hidden = false;
      document.documentElement.dataset.terminal = "ghostty-rgba-wasm";
    },
    dispose() { resizeObserver?.disconnect(); },
  };
}

export function worker({ get, send, configuration }) {
  let kernel, transport, presenter, words, word, seen = {}, reported = "";
  // What the page reads of the terminal, sent when it changes.
  function report() {
    if (!transport) return;
    const { cols, rows } = transport.dimensions();
    const state = { graphicsActive: transport.graphicsActive(), cursor: transport.cursorStyle(),
      fontSize: transport.fontSize(), cols, rows, geometry: transport.geometry(),
      frame: Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0 };
    const text = JSON.stringify(state);
    if (text === reported) return;
    reported = text;
    send({ type: "display-state", ...state });
  }
  return {
    service() {
      if (!kernel) return;
      const status = kernel._dolly_terminal_present_pending();
      if (status !== 0) throw new Error(`Dolly terminal presentation failed with status ${status}`);
      report();
      // Wakes the presenter, which waits on the frame sequence while idle.
      const frame = Atomics.load(words, word + A.DOLLY_DISPLAY_WORD_FRAME_SEQUENCE);
      const flags = Atomics.load(words, word + A.DOLLY_DISPLAY_WORD_FLAGS);
      const cursor = Atomics.load(words, word + A.DOLLY_DISPLAY_WORD_CURSOR_STYLE);
      if (frame === seen.frame && flags === seen.flags && cursor === seen.cursor) return;
      seen = { frame, flags, cursor };
      Atomics.notify(words, word + A.DOLLY_DISPLAY_WORD_FRAME_SEQUENCE);
    },
    messages: {
      "display-surface"({ width, height, devicePixelRatio }) { transport?.publishSurface(width, height, devicePixelRatio); },
      "display-copy"() { return transport.copySelection(); },
    },
    start({ dolly, memory, kernelExports }) {
      if (dolly._dolly_display_prepare() !== 0) throw new Error("Dolly display preparation failed");
      const address = Number(dolly._dolly_display_module_address()), size = Number(dolly._dolly_display_module_size());
      if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) || address <= 0 ||
          size <= 0 || size > 64 * 1024 * 1024 || address > memory.buffer.byteLength - size) {
        throw new Error("invalid resident display plugin range");
      }
      const display = get("runtime").kernelPlugin(new Uint8Array(memory.buffer, address, size).slice(), kernelExports);
      const getDriver = display.exports.dolly_display_driver_get_v5;
      if (typeof getDriver !== "function" || dolly._dolly_display_install(getDriver()) !== 0) {
        throw new Error("Dolly display installation failed");
      }
      const mailbox = Number(dolly._dolly_display_mailbox_address());
      transport = new DisplayTransport(memory.buffer, mailbox, Number(dolly._dolly_display_copy_buffer_address()));
      words = transport.words;
      word = transport.word;
      kernel = dolly;
      const capacity = A.DOLLY_DISPLAY_MAX_WIDTH * A.DOLLY_DISPLAY_MAX_HEIGHT * 4, limit = memory.buffer.byteLength;
      const frameAddresses = [0, 1].map(index => Number(dolly._dolly_display_framebuffer_address(index)));
      if (frameAddresses.some(address => !Number.isSafeInteger(address) || address <= 0 || address > limit - capacity)) {
        throw new Error("invalid display framebuffer range");
      }
      presenter = new FramebufferPresenter(configuration.canvas, memory.buffer, frameAddresses, capacity, transport, {
          fatal: message => send({ type: "display-failed", message }),
          painted: report,
          cursor: report,
        });
      presenter.start();
      // The page notifies the animation frame: a program waiting for it
      // resumes then, not at the next service tick.
      get("runtime").serviceOnNotify(words, word + A.DOLLY_DISPLAY_WORD_ANIMATION_FRAME_SEQUENCE);
      report();
    },
    // The image has ended: the page keeps its last frame.
    dispose() {
      presenter?.stop();
      if (presenter?.image) send({ type: "display-ended", image: presenter.image });
    },
  };
}
