import * as T from "./abi.mjs";
export { DOLLY_TOUCH_ABI_DIGEST as digest } from "./abi.mjs";

const word = { read: T.DOLLY_TOUCH_WORD_READ, write: T.DOLLY_TOUCH_WORD_WRITE,
  lease: T.DOLLY_TOUCH_WORD_LEASE, enabled: T.DOLLY_TOUCH_WORD_ENABLED };
// Moves leave room for every finger's down and its end.
const moveReserve = 2 * T.DOLLY_TOUCH_FINGERS;
const buttonsEnd = T.DOLLY_TOUCH_LABELS_OFFSET + T.DOLLY_TOUCH_BUTTON_COUNT * T.DOLLY_TOUCH_LABEL_SIZE;

// The Worker's end of the touch mailbox, the one producer of its records: the
// page sends it the fingers it took. A finger is delivered under the lease its
// down was written for; the fingers of an earlier lease, and those refused,
// are nobody's until they end.
export class TouchTransport {
  // The ring's size is the contract's; a test may shrink it.
  constructor(buffer, address, { capacity = T.DOLLY_TOUCH_CAPACITY } = {}) {
    if (!(buffer instanceof SharedArrayBuffer)) throw new Error("Dolly touch transport requires shared Wasm memory");
    if (!Number.isSafeInteger(address) || address <= 0 || address % 4 !== 0 || !Number.isSafeInteger(capacity) ||
        capacity <= moveReserve || (capacity & (capacity - 1)) !== 0 ||
        T.DOLLY_TOUCH_HEADER_SIZE + capacity * T.DOLLY_TOUCH_RECORD_SIZE > T.DOLLY_TOUCH_BUTTONS_OFFSET ||
        address > buffer.byteLength - buttonsEnd) {
      throw new Error("Dolly supplied an invalid touch mailbox");
    }
    this.view = new DataView(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.capacity = capacity;
    this.fingers = new Map();
    this.ignored = new Set();
    this.heldLease = 0;
    this.nextId = 1;
    this.dropped = 0;
  }

  load(name) { return Atomics.load(this.words, this.address / 4 + word[name]) >>> 0; }

  // The holder's lease word: zero while no program holds the lease.
  lease() { return this.load("lease"); }

  free() { return this.capacity - ((this.load("write") - this.load("read")) >>> 0); }

  write(id, phase, { x, y, pressure, time }) {
    const write = this.load("write");
    const offset = this.address + T.DOLLY_TOUCH_HEADER_SIZE + (write & (this.capacity - 1)) * T.DOLLY_TOUCH_RECORD_SIZE;
    [id, phase, x, y, pressure, this.dropped, time, this.heldLease]
      .forEach((value, index) => this.view.setUint32(offset + index * 4, value >>> 0, true));
    this.dropped = 0;
    Atomics.store(this.words, this.address / 4 + word.write, (write + 1) | 0);
  }

  // The lease records are written under. A new one ends the fingers of the
  // one before: they are nobody's until they end.
  follow() {
    const lease = this.lease();
    if (lease !== this.heldLease) {
      for (const pointer of this.fingers.keys()) this.ignored.add(pointer);
      this.fingers.clear();
      this.heldLease = lease;
    }
    return lease;
  }

  // One Pointer Event of a finger as samples ({ x, y, pressure, time }, the
  // coalesced moves of a pointermove). Returns whether the finger is this
  // module's, so that it is not also the pointer.
  finger(phase, pointerId, samples) {
    const lease = this.follow();
    const id = this.fingers.get(pointerId), ends = phase === T.DOLLY_TOUCH_UP || phase === T.DOLLY_TOUCH_CANCEL;
    if (id === undefined) {
      if (this.ignored.has(pointerId)) {
        if (ends) this.ignored.delete(pointerId);
        return true;
      }
      if (phase !== T.DOLLY_TOUCH_DOWN || !lease) return false;
      // The ring keeps room for this down and the end of every finger that is down.
      if (this.fingers.size === T.DOLLY_TOUCH_FINGERS || this.free() < this.fingers.size + 2) {
        this.dropped++;
        this.ignored.add(pointerId);
        return true;
      }
      const assigned = this.nextId;
      this.nextId = assigned === 0xffffffff ? 1 : assigned + 1;
      this.fingers.set(pointerId, assigned);
      this.write(assigned, phase, samples.at(-1));
    } else if (ends) {
      this.fingers.delete(pointerId);
      this.write(id, phase, samples.at(-1));
    } else {
      for (const sample of samples) {
        if (this.free() > moveReserve) this.write(id, T.DOLLY_TOUCH_MOVE, sample);
        else this.dropped++;
      }
    }
    Atomics.notify(this.words, this.address / 4 + word.write);
    return true;
  }

  // The holder's labels and the labels word they were read under, or null
  // while the kernel is changing them.
  buttons() {
    const word = (this.address + T.DOLLY_TOUCH_BUTTONS_OFFSET) / 4;
    const labels = Atomics.load(this.words, word) >>> 0;
    const count = Math.min(this.view.getUint32(this.address + T.DOLLY_TOUCH_LABEL_COUNT_OFFSET, true),
      T.DOLLY_TOUCH_BUTTON_COUNT);
    const texts = Array.from({ length: count }, (_, index) => {
      const at = this.address + T.DOLLY_TOUCH_LABELS_OFFSET + index * T.DOLLY_TOUCH_LABEL_SIZE;
      const bytes = new Uint8Array(this.view.buffer, at, T.DOLLY_TOUCH_LABEL_SIZE).slice();
      return new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0) >>> 0));
    });
    return Atomics.load(this.words, word) >>> 0 === labels ? { labels, texts } : null;
  }

  // A press of the holder's button index, of the labels read under the word
  // labels, while the ring keeps room for it and every finger's end.
  press(index, labels, time) {
    if (!this.follow()) return;
    if (this.free() < this.fingers.size + 1) {
      this.dropped++;
      return;
    }
    this.write(index, T.DOLLY_TOUCH_PRESS, { x: labels, y: 0, pressure: 0, time });
    Atomics.notify(this.words, this.address / 4 + word.write);
  }

  // Tells the kernel whether this page listens: without it no lease is given.
  enable(enabled) {
    Atomics.store(this.words, this.address / 4 + word.enabled, enabled ? 1 : 0);
  }
}

const phases = { pointerdown: T.DOLLY_TOUCH_DOWN, pointermove: T.DOLLY_TOUCH_MOVE,
  pointerup: T.DOLLY_TOUCH_UP, pointercancel: T.DOLLY_TOUCH_CANCEL };

// The page's fingers on the canvas. They are taken before input@0's listeners
// on the canvas see them, and only while a program holds the lease, as the
// Worker last reported it: without one the terminal's scroll and pinch are
// input@0's. A finger taken stays this module's until it ends. The holder's
// buttons are input@0's bar's, before its Paste.
export function browser({ canvas, surfaceSize, send, get }) {
  let started = false, lease = 0;
  const taken = new Set();
  // Positions are pixels of the frame the canvas shows, as input@0's pointer records are.
  function sample(event) {
    const bounds = canvas.getBoundingClientRect(), { width, height } = surfaceSize() ?? canvas;
    return { x: Math.round(bounds.width === 0 ? 0 : (event.clientX - bounds.left) * width / bounds.width),
      y: Math.round(bounds.height === 0 ? 0 : (event.clientY - bounds.top) * height / bounds.height),
      pressure: Math.round(event.pressure * 1000), time: Math.floor(event.timeStamp) };
  }
  function listen(event) {
    if (!started || event.pointerType !== "touch" || event.target !== canvas) return;
    const phase = phases[event.type], { pointerId } = event;
    if (phase === T.DOLLY_TOUCH_DOWN) {
      if (!lease) return;
      taken.add(pointerId);
    } else if (!taken.has(pointerId)) return;
    else if (phase !== T.DOLLY_TOUCH_MOVE) taken.delete(pointerId);
    const coalesced = phase === T.DOLLY_TOUCH_MOVE ? event.getCoalescedEvents?.() ?? [] : [];
    send({ type: "touch-finger", phase, pointerId, samples: (coalesced.length ? coalesced : [event]).map(sample) });
    event.preventDefault();
    event.stopPropagation();
  }
  // A finger held still is a long press, the program's to read, not the page's menu.
  function menu(event) {
    if (lease) event.preventDefault();
  }
  for (const type of Object.keys(phases)) window.addEventListener(type, listen, { capture: true });
  canvas.addEventListener("contextmenu", menu);
  return {
    page: { get touchTransport() { return started ? { lease: () => lease } : undefined; } },
    messages: {
      "touch-lease"(message) { lease = message.lease; },
      "touch-buttons"({ labels, texts }) {
        get("input").buttons(texts, (index, event) =>
          send({ type: "touch-press", index, labels, time: Math.floor(event.timeStamp) }));
      },
    },
    start() { started = true; },
    dispose() {
      for (const type of Object.keys(phases)) window.removeEventListener(type, listen, { capture: true });
      canvas.removeEventListener("contextmenu", menu);
      get("input")?.buttons([]);
      started = false;
    },
  };
}

// The holder's lease and labels are read at each service tick and reported when they change.
export function worker({ get, send }) {
  let transport, stop, reported = 0, shown = 0;
  return {
    messages: {
      "touch-finger"({ phase, pointerId, samples }) { transport?.finger(phase, pointerId, samples); },
      "touch-press"({ index, labels, time }) { transport?.press(index, labels, time); },
    },
    service() {
      const lease = transport?.lease() ?? 0;
      if (transport && lease !== reported) send({ type: "touch-lease", lease: reported = lease });
      const buttons = transport?.buttons();
      if (buttons && buttons.labels !== shown) send({ type: "touch-buttons", ...buttons, labels: shown = buttons.labels });
    },
    start({ kernel, memory }) {
      const address = Number(kernel.dolly_touch_mailbox_address());
      transport = new TouchTransport(memory.buffer, address);
      transport.enable(true);
      // The finger's records notify the write word: a program waiting for a finger resumes then.
      stop = get("runtime").serviceOnNotify(transport.words, address / 4 + word.write);
      return {};
    },
    dispose() {
      transport?.enable(false);
      transport = undefined;
      stop?.();
    },
  };
}
