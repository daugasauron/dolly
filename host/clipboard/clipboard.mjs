import * as C from "./abi.mjs";
export { DOLLY_CLIPBOARD_ABI_DIGEST as digest } from "./abi.mjs";

const encoder = new TextEncoder();
const word = { copy: C.DOLLY_CLIPBOARD_WORD_COPY, length: C.DOLLY_CLIPBOARD_WORD_LENGTH,
  holder: C.DOLLY_CLIPBOARD_WORD_HOLDER, enabled: C.DOLLY_CLIPBOARD_WORD_ENABLED };

// The Worker's end of the clipboard mailbox. The Worker runs the kernel, so
// what it reads and writes here is never half written by the other side.
export class ClipboardTransport {
  constructor(buffer, address) {
    if (!(buffer instanceof SharedArrayBuffer)) throw new Error("Dolly clipboard transport requires shared Wasm memory");
    if (!Number.isSafeInteger(address) || address <= 0 || address % 4 !== 0 ||
        address > buffer.byteLength - C.DOLLY_CLIPBOARD_HEADER_SIZE - C.DOLLY_CLIPBOARD_CAPACITY) {
      throw new Error("Dolly supplied an invalid clipboard mailbox");
    }
    this.words = new Int32Array(buffer);
    this.text = new Uint8Array(buffer, address + C.DOLLY_CLIPBOARD_HEADER_SIZE, C.DOLLY_CLIPBOARD_CAPACITY);
    this.word = address / 4;
  }

  load(name) { return Atomics.load(this.words, this.word + word[name]) >>> 0; }

  // The clipboard's text, or null when it is not UTF-8.
  read() {
    const length = Math.min(this.load("length"), C.DOLLY_CLIPBOARD_CAPACITY);
    try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(this.text.slice(0, length)); }
    catch { return null; }
  }

  // A paste the user made; false when it does not fit.
  write(text) {
    const bytes = encoder.encode(text);
    if (bytes.length > C.DOLLY_CLIPBOARD_CAPACITY) return false;
    this.text.set(bytes);
    Atomics.store(this.words, this.word + word.length, bytes.length);
    return true;
  }

  // Tells the kernel whether this page listens: without it no program holds the clipboard.
  enable(enabled) { Atomics.store(this.words, this.word + word.enabled, enabled ? 1 : 0); }
}

// The page's side: a program's copy reaches the browser's clipboard only while
// the page has the focus and the user's activation, a key press or a click on
// the page moments before (navigator.userActivation), as the copy's own key
// press or menu click gives it. A paste the user makes is the clipboard's
// first (input@0 hands it over), and reaches a program holding the clipboard
// and the input lease as its paste chord's keys.
export function browser({ send, get, showStatus }) {
  let started = false, held = false;
  get("input").pastes(text => {
    if (!started || encoder.encode(text).length > C.DOLLY_CLIPBOARD_CAPACITY) return false;
    send({ type: "clipboard-paste", text });
    return held;
  });
  const copied = state => { document.documentElement.dataset.clipboardCopy = state; };
  return {
    messages: {
      "clipboard-holder"(message) { held = message.held; },
      "clipboard-copy"({ text }) {
        if (typeof text !== "string") throw new Error("Dolly supplied an invalid clipboard copy");
        if (!document.hasFocus() || !navigator.userActivation?.isActive) {
          copied("inactive");
          return;
        }
        navigator.clipboard.writeText(text).then(() => copied("copied"), () => {
          copied("denied");
          showStatus("Copy not delivered: the browser did not let the page write the clipboard");
        });
      },
    },
    start() { started = true; },
    dispose() {
      started = false;
      get("input")?.pastes(null);
    },
  };
}

// The holder and the copies are read at each service tick and reported when they change.
export function worker({ send }) {
  let transport, copies = 0, held = false;
  return {
    messages: {
      "clipboard-paste"({ text }) { transport?.write(text); },
    },
    service() {
      if (!transport) return;
      const holder = transport.load("holder") !== 0;
      if (holder !== held) send({ type: "clipboard-holder", held: held = holder });
      const copy = transport.load("copy");
      if (copy === copies) return;
      copies = copy;
      const text = transport.read();
      if (text !== null) send({ type: "clipboard-copy", text });
    },
    start({ kernel, memory }) {
      transport = new ClipboardTransport(memory.buffer, Number(kernel.dolly_clipboard_mailbox_address()));
      copies = transport.load("copy");
      transport.enable(true);
      return {};
    },
    dispose() {
      transport?.enable(false);
      transport = undefined;
    },
  };
}
