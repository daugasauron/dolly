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

// The Worker's end of the input mailbox, the one producer of its records:
// the page sends it what it sees.
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
  // newest position replaces an unsent one. The sample is sent at each service
  // tick while more than half the ring is free (flushMotion(eventCapacity / 2)),
  // and ahead of any other record that leaves room for both. So motion never
  // takes a key's slot, and a program that does not read delays it but never
  // loses it.
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

  motionPending() {
    return this.movementX !== 0 || this.movementY !== 0 || this.position !== null;
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

// The record of a key event, as pushSyntheticKey takes it.
function keyRecord(event) {
  return { key: event.key, code: event.code, modifiers: modifiers(event) |
    (event.getModifierState?.("CapsLock") ? 16 : 0) | (event.getModifierState?.("NumLock") ? 32 : 0),
    action: event.type === "keyup" ? 0 : event.repeat ? 2 : 1, flags: event.isComposing ? 1 : 0 };
}

// What a pointer record keeps of its event.
const pointerEvent = event => ({ shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey,
  metaKey: event.metaKey, button: event.button });

// The page's input: keys, pointer, wheel, focus, IME text and paste become
// messages to the Worker, which writes them into the mailbox as bounded
// records; interpretation stays in Wasm. This is the one listener that
// decides which keys the guest reads: the page's own chords are taken before
// it (src/page-chords.mjs) and module UIs claim theirs through it. Records
// flow once the Worker's side has started.
export function browser({ canvas, keyboard, showStatus, claimsKey, surfaceSize, send, ask, get }) {
  // selecting: the primary button's press went to the terminal; held: the
  // middle or secondary button's.
  let started = false, selecting = false, held = -1, flags = 0;
  // Every message that may write records is counted: input is idle once the
  // Worker reports its ring empty after the last of them.
  let sent = 0, idleThrough = 0;
  const heldKeys = new Map();
  const leased = () => (flags & 1) !== 0;
  const relativePointerRequested = () => (flags & 3) === 3;
  // Pointer motion and the newest position wait for the next animation frame,
  // and go ahead of any other record.
  let movementX = 0, movementY = 0, position = null, motionScheduled = false;
  function flushMotion() {
    if (!movementX && !movementY && !position) return;
    send({ type: "input-motion", movementX, movementY, position, sequence: ++sent });
    movementX = movementY = 0;
    position = null;
  }
  // Sends a record; tell() resolves to whether the Worker wrote it.
  const post = message => {
    if (!started) return;
    flushMotion();
    send({ ...message, sequence: ++sent });
  };
  const tell = message => {
    if (!started) return Promise.resolve(false);
    flushMotion();
    return ask({ ...message, sequence: ++sent });
  };
  function scheduleMotion() {
    if (motionScheduled) return;
    motionScheduled = true;
    requestAnimationFrame(() => { motionScheduled = false; if (started) flushMotion(); });
  }
  const client = {
    pushKey: event => tell({ type: "input-key", ...keyRecord(event) }),
    pushSyntheticKey: (key, code, modifiers = 0, action = 1, flags = 0) =>
      tell({ type: "input-key", key, code, modifiers, action, flags }),
    pushText: text => tell({ type: "input-text", text }),
    pushPaste: text => tell({ type: "input-paste", text }),
    pushPointer(x, y, action, event) {
      if (action !== 2) return tell({ type: "input-pointer", x, y, action, event: pointerEvent(event) });
      if (started) {
        position = { x, y, event: pointerEvent(event) };
        scheduleMotion();
      }
      return Promise.resolve(started);
    },
    pushPointerMotion(event) {
      if (!started) return;
      movementX += event.movementX;
      movementY += event.movementY;
      scheduleMotion();
    },
    pushScroll: (delta, unit) => tell({ type: "input-scroll", delta, unit }),
    leased, relativePointerRequested,
    inputIdle: () => idleThrough === sent && !movementX && !movementY && !position,
  };

  // Resolves to the shell's status for the command typed.
  const submit = (command, text = `${command}\r`) => started ? ask({ type: "input-submit", text, sequence: ++sent })
    : Promise.reject(new Error("Dolly input is not started"));

  function releaseHeldKeys() {
    for (const key of heldKeys.values()) post({ type: "input-key", ...keyRecord({ ...key, type: "keyup",
      ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }) });
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
        void get("runtime").terminal.interruptForeground();
      }
      return;
    }
    if (!started) return;
    if (event.type === "keydown" && event.key === "Escape" && document.pointerLockElement === canvas) {
      document.exitPointerLock();
      event.preventDefault();
      return;
    }
    const terminalPaste = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyV";
    const programPaste = leased() && !event.altKey && (
      (event.code === "KeyV" && (event.ctrlKey || event.metaKey)) ||
      (event.code === "Insert" && event.shiftKey && !event.ctrlKey && !event.metaKey));
    if (programPaste || terminalPaste) {
      // Let the browser deliver clipboard bytes through a user-initiated
      // PasteEvent. It goes to the focused element, and a click on page text
      // leaves none: the paste handler would not see it.
      if (event.type === "keydown") keyboard.focus({ preventScroll: true });
      return;
    }
    // Ctrl+C interrupts the foreground program where the terminal lets it;
    // the Worker decides, and otherwise writes the key.
    post({ type: interruptChord(event) ? "input-interrupt-key" : "input-key", ...keyRecord(event) });
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
    void client.pushPointer(bounds.width === 0 ? 0 : (event.clientX - bounds.left) * width / bounds.width,
      bounds.height === 0 ? 0 : (event.clientY - bounds.top) * height / bounds.height, action, event);
  }

  function pushPointerPresence(inside) {
    if (leased()) post({ type: "input-presence", inside });
  }
  canvas.addEventListener("pointerenter", () => pushPointerPresence(true));
  canvas.addEventListener("pointerleave", () => pushPointerPresence(false));
  window.addEventListener("blur", () => {
    pushPointerPresence(false);
    post({ type: "input-focus", focused: false });
  });
  window.addEventListener("focus", () => {
    post({ type: "input-focus", focused: true });
    pushPointerPresence(canvas.matches(":hover"));
  });

  // The terminal takes the primary button and every move, for its selection
  // or for a program that asked for the mouse, which also gets the middle and
  // secondary buttons; a program holding the lease reads every button and
  // every move. A finger's drag on the terminal
  // scrolls instead, as a wheel does: its distance in the
  // frame's pixels, so the text follows the finger. Two fingers moving apart
  // or together change the font's size as Ctrl+= and Ctrl+- do, a step for
  // each 20 CSS px.
  const fingers = new Map();
  let touch = null, span = 0;
  const spread = () => { const [a, b] = fingers.values(); return Math.hypot(a.x - b.x, a.y - b.y); };
  const lifted = (event) => {
    fingers.delete(event.pointerId);
    // The finger that stays scrolls on from where it is.
    const [id, finger] = fingers.entries().next().value ?? [];
    touch = finger ? { id, y: finger.y } : null;
  };
  // A program holding the lease has every button, and one that asks the
  // terminal for the mouse, which the terminal shows by the arrow
  // (src/ghostty/display.c), the middle and secondary too. The browser's
  // menu and middle-button actions then give way; Shift keeps them.
  const programHasMouse = event => leased() || (!event.shiftKey && canvas.style.cursor === "default");
  canvas.addEventListener("pointerdown", (event) => {
    if (!started || (event.button !== 0 && !leased() && !(event.button <= 2 && programHasMouse(event)))) return;
    if (event.pointerType === "touch" && !leased()) {
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      touch ??= { id: event.pointerId, y: event.clientY };
      if (fingers.size === 2) span = spread();
      keyboard.focus({ preventScroll: true });
      event.preventDefault();
      return;
    }
    if (relativePointerRequested()) {
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
    if (leased()) keyboard.blur();
    else keyboard.focus({ preventScroll: true });
    if (event.button === 0) selecting = true;
    else held = event.button;
    pushPointer(event, 1);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (document.pointerLockElement === canvas) {
      if (relativePointerRequested()) client.pushPointerMotion(event);
      event.preventDefault();
      return;
    }
    if (fingers.has(event.pointerId)) {
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.size === 2) {
        for (const now = spread(); Math.abs(now - span) >= 20; span += now > span ? 20 : -20) {
          void client.pushSyntheticKey(now > span ? "=" : "-", now > span ? "Equal" : "Minus", 2);
        }
      } else if (touch?.id === event.pointerId) {
        // The wheel is reported where the finger is, as where the mouse is.
        pushPointer(event, 2);
        post({ type: "input-scroll", delta: (touch.y - event.clientY) * canvas.height / canvas.clientHeight, unit: 0 });
        touch.y = event.clientY;
      }
      event.preventDefault();
      return;
    }
    if (!started) return;
    // A release the page did not see, outside the window, comes before the move.
    if (selecting && !leased() && (event.buttons & 1) === 0) {
      selecting = false;
      pushPointer(event, 0);
    }
    pushPointer(event, 2);
    if (selecting || leased()) event.preventDefault();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (fingers.has(event.pointerId)) lifted(event);
    if (!started || (!leased() && !(event.button === 0 ? selecting : event.button === held))) return;
    if (event.button === 0) selecting = false;
    else held = -1;
    pushPointer(event, 0);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  canvas.addEventListener("contextmenu", event => {
    if (programHasMouse(event)) event.preventDefault();
  });
  // A middle press may start the browser's autoscroll, and its release paste
  // X11's selection.
  for (const type of ["mousedown", "mouseup", "auxclick"]) {
    canvas.addEventListener(type, event => {
      if (event.button === 1 && programHasMouse(event)) event.preventDefault();
    });
  }
  canvas.addEventListener("pointercancel", (event) => {
    if (fingers.has(event.pointerId)) lifted(event);
    if (selecting || held >= 0) {
      selecting = false;
      held = -1;
      pushPointer(event, 0);
    }
  });
  // A capture ends when its program stops asking, also one granted late.
  function endStaleCapture() {
    if (document.pointerLockElement === canvas && !relativePointerRequested()) document.exitPointerLock();
  }
  document.addEventListener("pointerlockchange", () => {
    selecting = false;
    post({ type: "input-capture", captured: document.pointerLockElement === canvas });
    endStaleCapture();
  });
  canvas.addEventListener("wheel", (event) => {
    if (!started) return;
    post({ type: "input-scroll", delta: event.deltaY, unit: event.deltaMode });
    event.preventDefault();
  }, { passive: false });

  keyboard.addEventListener("compositionend", (event) => {
    post({ type: "input-text", text: event.data });
    keyboard.value = "";
  });
  const deliverPaste = async text => {
    if (text && !await client.pushPaste(text)) showStatus("Paste not delivered: the program's input buffer is full or too small");
  };
  window.addEventListener("paste", (event) => {
    if (event.target !== keyboard && (!leased() ||
        (event.target !== document.body && event.target !== canvas))) return;
    event.preventDefault();
    void deliverPaste(event.clipboardData?.getData("text/plain") ?? "");
  });
  // A touchscreen has no paste chord: there the page shows its own Paste
  // button and reads the clipboard only inside the user's press of it.
  const pasteButton = document.body.appendChild(document.createElement("button"));
  pasteButton.id = "paste";
  pasteButton.type = "button";
  pasteButton.textContent = "Paste";
  pasteButton.style.cssText = "position:fixed;right:0.4rem;top:0.4rem;z-index:6;padding:0.35rem 0.6rem;color:inherit;" +
    "background:#333;border:1px solid #f2d45c;border-radius:6px;font:inherit;font-size:15px;touch-action:none";
  const touchscreen = matchMedia("(pointer: coarse)"), placePaste = () => { pasteButton.hidden = !touchscreen.matches; };
  placePaste();
  touchscreen.addEventListener("change", placePaste);
  pasteButton.addEventListener("click", () => navigator.clipboard.readText()
    .then(deliverPaste, () => showStatus("Paste refused: the browser did not let the page read the clipboard")));

  return {
    page: {
      get inputTransport() { return started ? client : undefined; },
      submit,
      input: data => client.pushText(data),
      paste: data => client.pushPaste(data),
      key: (key, code, modifiers = 0) => client.pushSyntheticKey(key, code, modifiers),
    },
    messages: {
      // The kernel's lease and pointer request, as the Worker saw them change.
      "input-flags"(message) {
        flags = message.flags;
        endStaleCapture();
      },
      "input-idle"(message) { idleThrough = message.through; },
      "input-dropped"(message) {
        document.documentElement.dataset.inputDropped = message.count;
        showStatus("Input dropped: the program is not reading it");
      },
    },
    start() { started = true; },
    dispose() {
      started = false;
      endStaleCapture();
      touchscreen.removeEventListener("change", placePaste);
      pasteButton.remove();
    },
  };
}

export function worker({ get, send }) {
  let transport, stop, handled = 0, reported = 0;
  // Each record the page sends, in its order; `sequence` counts them.
  const record = write => message => {
    if (!transport) return false;
    const written = write(message);
    handled = message.sequence;
    return written;
  };
  return {
    messages: {
      "input-key": record(({ key, code, modifiers, action, flags }) => transport.pushSyntheticKey(key, code, modifiers, action, flags)),
      // Ctrl+C: the foreground program is interrupted if the terminal lets it,
      // and reads the key otherwise.
      "input-interrupt-key": record(({ key, code, modifiers, action, flags }) =>
        get("runtime").terminal.interruptForeground() || transport.pushSyntheticKey(key, code, modifiers, action, flags)),
      "input-text": record(({ text }) => transport.pushText(text)),
      "input-paste": record(({ text }) => transport.pushPaste(text)),
      "input-pointer": record(({ x, y, action, event }) => transport.pushPointer(x, y, action, event)),
      "input-scroll": record(({ delta, unit }) => transport.pushScroll(delta, unit)),
      "input-motion": record(({ movementX, movementY, position }) => {
        transport.pushPointerMotion({ movementX, movementY });
        if (position) transport.pushPointer(position.x, position.y, 2, position.event);
        transport.flushMotion(transport.eventCapacity / 2);
        return true;
      }),
      "input-focus": record(({ focused }) => transport.pushFocus(focused)),
      "input-capture": record(({ captured }) => transport.pushPointerCapture(captured)),
      "input-presence": record(({ inside }) => transport.pushPointerPresence(inside)),
      // A command typed at the shell, resolving to the shell's status for it.
      // The page hears of the foreground the shell left before it hears the status.
      async "input-submit"(message) {
        const runtime = get("runtime"), sequence = runtime.terminal.currentResultSequence();
        if (!record(({ text }) => transport.pushText(text))(message)) throw new Error("Dolly input mailbox is full");
        const status = await runtime.terminal.waitForResult(sequence);
        runtime.reportForeground();
        return status;
      },
    },
    // Motion the ring had no room for, and whether the ring is empty after
    // the last record the page sent.
    service() {
      if (!transport) return;
      transport.flushMotion(transport.eventCapacity / 2);
      if (handled !== reported && transport.inputIdle() && !transport.motionPending()) {
        reported = handled;
        send({ type: "input-idle", through: handled });
      }
    },
    start({ kernel, memory }) {
      const address = Number(kernel.dolly_input_mailbox_address());
      const started = transport = new InputTransport(memory.buffer, address, Number(kernel.dolly_input_paste_buffer_address()),
        { dropped: count => send({ type: "input-dropped", count }) });
      started.enable(true);
      // The page notifies the write word for a record a reader waits on: a
      // program waiting for input resumes then, not at the next service tick.
      stop = get("runtime").serviceOnNotify(started.words, started.word + InputTransport.eventWrite);
      // The kernel notifies the flags word when the lease or its pointer
      // request changes; the page decides with what it was last told.
      const index = started.word + InputTransport.flags;
      const follow = () => {
        if (transport !== started) return;
        const seen = Atomics.load(started.words, index);
        send({ type: "input-flags", flags: seen });
        void Promise.resolve(Atomics.waitAsync(started.words, index, seen).value).then(follow);
      };
      follow();
      return {};
    },
    dispose() {
      transport?.enable(false);
      transport = undefined;
      stop?.();
    },
  };
}
