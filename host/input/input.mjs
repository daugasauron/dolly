import * as A from "./abi.mjs";
export { DOLLY_INPUT_ABI_DIGEST as digest } from "./abi.mjs";

const encoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
// A record's strings are encoded here: TextEncoder does not write shared memory.
const recordData = new Uint8Array(A.DOLLY_INPUT_EVENT_DATA_SIZE);

// Appends value's UTF-8 to recordData; returns the new length, or -1 when the
// record's strings do not fit.
function appendString(value, length) {
  if (length < 0 || value === "") return length;
  const { read, written } = encoder.encodeInto(value, recordData.subarray(length));
  return read === value.length ? length + written : -1;
}

// The largest relative motion of one record, in thousandths of a CSS pixel.
const clampMotion = value => Math.max(-32_768_000, Math.min(32_768_000, value));

function modifiers(event) {
  return (event.shiftKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.altKey ? 4 : 0) | (event.metaKey ? 8 : 0);
}

// The page's end of the input mailbox: the one producer of its records.
export class InputTransport {
  static headerSize = A.DOLLY_INPUT_HEADER_SIZE;
  static eventRead = A.DOLLY_INPUT_WORD_EVENT_READ;
  static eventWrite = A.DOLLY_INPUT_WORD_EVENT_WRITE;
  static flags = A.DOLLY_INPUT_WORD_FLAGS;
  static pasteSequence = A.DOLLY_INPUT_WORD_PASTE_SEQUENCE;
  static pasteConsumedSequence = A.DOLLY_INPUT_WORD_PASTE_CONSUMED_SEQUENCE;
  static pasteLength = A.DOLLY_INPUT_WORD_PASTE_LENGTH;
  static enabled = A.DOLLY_INPUT_WORD_ENABLED;

  static keyEvent = 1;
  static textEvent = 2;
  static focusEvent = 4;
  static pasteEvent = 5;
  static pointerEvent = 6;
  static scrollEvent = 7;
  static pointerMotionEvent = 8;
  static pointerCaptureEvent = 9;
  static pointerPresenceEvent = 10;
  static droppedEvent = 11;

  // The ring and paste sizes are the contract's; a test may shrink them.
  // dropped(count) reports every record the ring had no room for.
  constructor(buffer, address, pasteAddress, { eventCapacity = A.DOLLY_INPUT_EVENT_CAPACITY,
    pasteCapacity = A.DOLLY_INPUT_PASTE_CAPACITY, dropped = () => {} } = {}) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error("Dolly input transport requires shared Wasm memory");
    }
    const within = (start, length) => Number.isSafeInteger(start) && Number.isSafeInteger(length) &&
      start > 0 && length > 0 && start <= buffer.byteLength - length;
    if (address % 4 !== 0 || !Number.isSafeInteger(eventCapacity) ||
        eventCapacity <= 1 || (eventCapacity & (eventCapacity - 1)) !== 0 ||
        !within(address, InputTransport.headerSize + eventCapacity * A.DOLLY_INPUT_EVENT_SIZE) ||
        !within(pasteAddress, pasteCapacity)) {
      throw new Error("Dolly supplied an invalid input mailbox");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.view = new DataView(buffer);
    this.dropped = dropped;
    this.droppedRecords = 0;
    this.lossMarked = false;
    this.movementX = 0;
    this.movementY = 0;
    this.position = null;
    this.motionScheduled = false;
    this.address = address;
    this.word = address / 4;
    this.eventCapacity = eventCapacity;
    this.pasteAddress = pasteAddress;
    this.pasteCapacity = pasteCapacity;
  }

  // Free slots for records: the ring's last slot is kept for a loss mark. This
  // page is the ring's one producer, so they stay free until it writes.
  freeRecords() {
    const read = Atomics.load(this.words, this.word + InputTransport.eventRead) >>> 0;
    const write = Atomics.load(this.words, this.word + InputTransport.eventWrite) >>> 0;
    return this.eventCapacity - 1 - ((write - read) >>> 0);
  }

  // Writes one record if the ring has room and the record's strings fit.
  writeRecord({ type, action = 0, modifiers = 0, flags = 0, x = 0, y = 0, key = "", code = "", text = "" }) {
    const keyEnd = appendString(key, 0), codeEnd = appendString(code, keyEnd), textEnd = appendString(text, codeEnd);
    const lossMark = type === InputTransport.droppedEvent;
    if (textEnd < 0 || this.freeRecords() < (lossMark ? 0 : 1)) return false;
    this.lossMarked = lossMark;
    const write = Atomics.load(this.words, this.word + InputTransport.eventWrite) >>> 0;
    const offset = this.address + InputTransport.headerSize +
      (write & (this.eventCapacity - 1)) * A.DOLLY_INPUT_EVENT_SIZE;
    const view = this.view;
    view.setUint32(offset, type, true);
    view.setUint32(offset + 4, action, true);
    view.setUint32(offset + 8, modifiers, true);
    view.setUint32(offset + 12, flags, true);
    view.setInt32(offset + 16, x, true);
    view.setInt32(offset + 20, y, true);
    view.setUint32(offset + 24, 0, true);
    view.setUint32(offset + 28, 0, true);
    view.setUint16(offset + 32, keyEnd, true);
    view.setUint16(offset + 34, codeEnd - keyEnd, true);
    view.setUint16(offset + 36, textEnd - codeEnd, true);
    view.setUint16(offset + 38, 0, true);
    recordData.fill(0, textEnd);
    this.bytes.set(recordData, offset + 40);

    Atomics.store(this.words, this.word + InputTransport.eventWrite, (write + 1) | 0);
    // Wakes the record's reader (worker().start): a program holding the lease
    // reads every record, the terminal's reader keys, text and paste. The
    // terminal handles its own pointer and scroll records on its tick, all of
    // them before it draws one frame.
    if (this.leased() || (type !== InputTransport.pointerEvent && type !== InputTransport.scrollEvent)) {
      Atomics.notify(this.words, this.word + InputTransport.eventWrite);
    }
    return true;
  }

  // The ring is the only queue of input, so a record it has no room for is
  // lost. It is counted and reported, and one mark in the ring's last slot
  // tells the reader where; the next mark follows only after later records.
  refuse() {
    this.dropped(++this.droppedRecords);
    if (!this.lossMarked) this.writeRecord({ type: InputTransport.droppedEvent, action: this.droppedRecords });
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
      const x = clampMotion(this.movementX), y = clampMotion(this.movementY);
      this.writeRecord({ type: InputTransport.pointerMotionEvent, x, y });
      this.movementX -= x;
      this.movementY -= y;
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
    return this.pushSyntheticKey(event.key, event.code, modifiers(event) |
      (event.getModifierState?.("CapsLock") ? 16 : 0) | (event.getModifierState?.("NumLock") ? 32 : 0),
      event.type === "keyup" ? 0 : event.repeat ? 2 : 1, event.isComposing ? 1 : 0);
  }

  pushSyntheticKey(key, code, modifiers = 0, action = 1, flags = 0) {
    return this.pushRecord({ type: InputTransport.keyEvent, action, modifiers, flags, key, code });
  }

  // All or nothing: a partially delivered paste or command would be worse
  // than a visible refusal. This page is the sole producer, so free records
  // counted here cannot disappear before they are written.
  pushText(text) {
    const bytes = encoder.encode(text), chunks = [];
    for (let offset = 0; offset < bytes.length;) {
      let end = Math.min(offset + recordData.length, bytes.length);
      while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
      chunks.push(textDecoder.decode(bytes.subarray(offset, end)));
      offset = end;
    }
    this.flushMotion(chunks.length);
    if (chunks.length > this.freeRecords()) return this.refuse();
    for (const chunk of chunks) this.writeRecord({ type: InputTransport.textEvent, text: chunk });
    return true;
  }

  // A program holding the lease reads a paste as text; the terminal takes the
  // bytes from the paste buffer, one paste at a time.
  pushPaste(text) {
    const bytes = encoder.encode(text);
    if (bytes.length > this.pasteCapacity) return false;
    if (this.leased()) return this.pushText(text);
    const published = Atomics.load(this.words, this.word + InputTransport.pasteSequence) >>> 0;
    const consumed = Atomics.load(this.words, this.word + InputTransport.pasteConsumedSequence) >>> 0;
    if (published !== consumed) return false;

    // The record must follow its bytes; the caller reports a paste that is not delivered.
    this.flushMotion(1);
    if (this.freeRecords() <= 0) return false;
    this.bytes.set(bytes, this.pasteAddress);
    Atomics.store(this.words, this.word + InputTransport.pasteLength, bytes.length);
    Atomics.store(this.words, this.word + InputTransport.pasteSequence, (published + 1) | 0);
    return this.writeRecord({ type: InputTransport.pasteEvent });
  }

  pushPointer(x, y, action, event) {
    const record = {
      type: InputTransport.pointerEvent,
      action,
      modifiers: modifiers(event),
      flags: Math.max(0, Math.min(4, event.button ?? 0)) << 8,
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    };
    if (action !== 2) return this.pushRecord(record);
    this.position = record;
    this.scheduleMotion();
    return true;
  }

  // A wheel delta in its own unit, as WheelEvent.deltaMode numbers them:
  // 0 CSS pixels, 1 lines, 2 pages.
  pushScroll(delta, unit) {
    const y = Math.max(-2_000_000_000, Math.min(2_000_000_000, Math.round(delta * 1000)));
    if (y === 0) return true;
    return this.pushRecord({ type: InputTransport.scrollEvent, action: unit, y });
  }

  pushPointerMotion(event) {
    this.movementX += Math.round(event.movementX * 1000);
    this.movementY += Math.round(event.movementY * 1000);
    this.scheduleMotion();
  }

  pushFocus(focused) {
    return this.pushRecord({ type: InputTransport.focusEvent, action: focused ? 1 : 0 });
  }

  pushPointerCapture(captured) {
    return this.pushRecord({ type: InputTransport.pointerCaptureEvent, action: captured ? 1 : 0 });
  }

  pushPointerPresence(inside) {
    return this.pushRecord({ type: InputTransport.pointerPresenceEvent, action: inside ? 1 : 0 });
  }

  inputIdle() {
    return Atomics.load(this.words, this.word + InputTransport.eventRead) ===
      Atomics.load(this.words, this.word + InputTransport.eventWrite);
  }

  // A foreground program holds the lease and reads every record.
  leased() {
    return (Atomics.load(this.words, this.word + InputTransport.flags) & 1) !== 0;
  }

  relativePointerRequested() {
    return (Atomics.load(this.words, this.word + InputTransport.flags) & 3) === 3;
  }

  // Tells the kernel whether this page listens: without it no lease is given.
  enable(enabled) {
    Atomics.store(this.words, this.word + InputTransport.enabled, enabled ? 1 : 0);
  }
}

// The page's input: keys, pointer, wheel, focus, IME text and paste become
// bounded mailbox records; interpretation stays in Wasm. This is the one
// listener that decides which keys the guest reads: the page's own chords
// are taken before it (src/page-chords.mjs) and module UIs claim theirs
// through it. Records flow once the transport starts.
export function browser({ canvas, keyboard, showStatus, claimsKey, surfaceSize, get }) {
  let transport, selecting = false;
  const heldKeys = new Map();
  const terminal = () => get("runtime").terminal;
  const interruptForeground = () => terminal()?.interruptForeground() ?? false;
  // Submitted commands awaiting their shell result; disposal ends the wait.
  const waiting = new Set();

  async function submit(command, text = `${command}\r`) {
    const sequence = terminal().currentResultSequence();
    if (!transport.pushText(text)) throw new Error("Dolly input mailbox is full");
    let stop;
    const stopped = new Promise((_resolve, reject) => { stop = reject; waiting.add(stop); });
    return Promise.race([terminal().waitForResult(sequence), stopped]).finally(() => waiting.delete(stop));
  }

  function releaseHeldKeys() {
    for (const key of heldKeys.values()) transport?.pushKey({ ...key, type: "keyup",
      ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });
    heldKeys.clear();
  }

  const interruptChord = event => event.type === "keydown" && event.ctrlKey &&
    !event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyC";

  function handleKeyboardEvent(event) {
    // Module UIs claim their keys first and the guest lets go of held keys.
    // A UI waiting on the foreground program claims with "interrupt": Ctrl+C
    // still interrupts that program. "key" claims one key and leaves the
    // rest of the keyboard with the guest.
    const claim = claimsKey(event);
    if (claim === "key") return;
    if (claim) {
      releaseHeldKeys();
      if (claim === "interrupt" && interruptChord(event)) {
        event.preventDefault();
        interruptForeground();
      }
      return;
    }
    if (!transport) return;
    if (event.type === "keydown" && event.key === "Escape" && document.pointerLockElement === canvas) {
      document.exitPointerLock();
      event.preventDefault();
      return;
    }
    const terminalPaste = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyV";
    const programPaste = transport.leased() && !event.altKey && (
      (event.code === "KeyV" && (event.ctrlKey || event.metaKey)) ||
      (event.code === "Insert" && event.shiftKey && !event.ctrlKey && !event.metaKey));
    if (programPaste || terminalPaste) {
      // Let the browser deliver clipboard bytes through a user-initiated PasteEvent.
      if (programPaste && event.type === "keydown") keyboard.focus({ preventScroll: true });
      return;
    }
    if (interruptChord(event) && interruptForeground()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    transport.pushKey(event);
    if (event.type === "keyup") heldKeys.delete(event.code);
    else heldKeys.set(event.code, {key:event.key,code:event.code,type:"keydown",repeat:false,
      ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey});
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  window.addEventListener("keydown", handleKeyboardEvent, { capture: true });
  window.addEventListener("keyup", handleKeyboardEvent, { capture: true });
  // Focus moving into a module UI (a dialog, a panel button) also takes the keyboard.
  document.addEventListener("focusin", event => { if (event.target !== keyboard) releaseHeldKeys(); });

  // Positions are pixels of the frame the canvas shows.
  function pushPointer(event, action) {
    const bounds = canvas.getBoundingClientRect();
    const {width,height} = surfaceSize() ?? canvas;
    transport?.pushPointer(bounds.width === 0 ? 0 : (event.clientX - bounds.left) * width / bounds.width,
      bounds.height === 0 ? 0 : (event.clientY - bounds.top) * height / bounds.height, action, event);
  }

  function pushPointerPresence(inside) {
    if (transport?.leased()) transport.pushPointerPresence(inside);
  }
  canvas.addEventListener("pointerenter", () => pushPointerPresence(true));
  canvas.addEventListener("pointerleave", () => pushPointerPresence(false));
  window.addEventListener("blur", () => {
    selecting = false;
    pushPointerPresence(false);
    transport?.pushFocus(false);
  });
  window.addEventListener("focus", () => {
    transport?.pushFocus(true);
    pushPointerPresence(canvas.matches(":hover"));
  });

  // The terminal takes the primary button's drags as its selection; a program
  // holding the lease reads every button and every move. A finger's drag on
  // the terminal scrolls instead, as a wheel does: its distance in the
  // frame's pixels, so the text follows the finger.
  let touch = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (!transport || (event.button !== 0 && !transport.leased())) return;
    if (event.pointerType === "touch" && !transport.leased()) {
      touch ??= { id: event.pointerId, y: event.clientY };
      keyboard.focus({ preventScroll: true });
      event.preventDefault();
      return;
    }
    if (transport.relativePointerRequested()) {
      keyboard.blur();
      event.preventDefault();
      if (!event.isTrusted) return;
      if (document.pointerLockElement !== canvas) {
        // Browsers may refuse capture; the program then keeps absolute pointer input.
        try { void Promise.resolve(canvas.requestPointerLock()).catch(() => {}); } catch {}
      } else {
        pushPointer(event, 1);
      }
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    if (transport.leased()) keyboard.blur();
    else keyboard.focus({ preventScroll: true });
    selecting = true;
    pushPointer(event, 1);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (document.pointerLockElement === canvas) {
      if (transport?.relativePointerRequested()) transport.pushPointerMotion(event);
      event.preventDefault();
      return;
    }
    if (touch?.id === event.pointerId) {
      transport?.pushScroll((touch.y - event.clientY) * canvas.height / canvas.clientHeight, 0);
      touch.y = event.clientY;
      event.preventDefault();
      return;
    }
    if (!transport?.leased() && (!selecting || (event.buttons & 1) === 0)) return;
    pushPointer(event, 2);
    event.preventDefault();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (touch?.id === event.pointerId) touch = null;
    if (!transport?.leased() && (!selecting || event.button !== 0)) return;
    selecting = false;
    pushPointer(event, 0);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  canvas.addEventListener("contextmenu", event => {
    if (transport?.leased()) event.preventDefault();
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (touch?.id === event.pointerId) touch = null;
    if (selecting) {
      selecting = false;
      pushPointer(event, 0);
    }
  });
  // A capture ends when its program stops asking, also one granted late.
  function endStaleCapture() {
    if (document.pointerLockElement === canvas && !transport?.relativePointerRequested()) document.exitPointerLock();
  }
  document.addEventListener("pointerlockchange", () => {
    selecting = false;
    transport?.pushPointerCapture(document.pointerLockElement === canvas);
    endStaleCapture();
  });
  canvas.addEventListener("wheel", (event) => {
    if (!transport) return;
    transport.pushScroll(event.deltaY, event.deltaMode);
    event.preventDefault();
  }, { passive: false });

  keyboard.addEventListener("compositionend", (event) => {
    transport?.pushText(event.data);
    keyboard.value = "";
  });
  window.addEventListener("paste", (event) => {
    if (event.target !== keyboard && (!transport?.leased() ||
        (event.target !== document.body && event.target !== canvas))) return;
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text && !transport?.pushPaste(text)) showStatus("Paste not delivered: the program's input buffer is full or too small");
  });

  return {
    page: {
      get inputTransport() { return transport; },
      submit,
      input: data => transport.pushText(data),
      paste: data => transport.pushPaste(data),
      key: (key, code, modifiers = 0) => transport.pushSyntheticKey(key, code, modifiers),
    },
    start(message) {
      const started = transport = new InputTransport(message.memory, message.address, message.pasteAddress, {
        dropped(count) {
          document.documentElement.dataset.inputDropped = count;
          showStatus("Input dropped: the program is not reading it");
        },
      });
      started.enable(true);
      // The kernel notifies the flags word when the lease or its pointer request changes.
      const index = started.word + InputTransport.flags;
      const follow = () => {
        if (transport !== started) return;
        const seen = Atomics.load(started.words, index);
        endStaleCapture();
        void Promise.resolve(Atomics.waitAsync(started.words, index, seen).value).then(follow);
      };
      follow();
    },
    dispose() {
      for (const stop of waiting) stop(new Error("Dolly stopped"));
      waiting.clear();
      transport?.enable(false);
      transport = undefined;
      endStaleCapture();
    },
  };
}

export function worker({ get }) {
  return {
    start({ dolly, memory }) {
      const address = Number(dolly._dolly_input_mailbox_address());
      // The page notifies the write word for a record a reader waits on: a
      // program waiting for input resumes then, not at the next service tick.
      const words = new Int32Array(memory.buffer), index = address / 4 + A.DOLLY_INPUT_WORD_EVENT_WRITE;
      const wait = () => Promise.resolve(Atomics.waitAsync(words, index, Atomics.load(words, index)).value)
        .then(() => { get("runtime").serviceDeferred(); wait(); });
      wait();
      return { memory: memory.buffer, address, pasteAddress: Number(dolly._dolly_input_paste_buffer_address()) };
    },
  };
}
