import * as B from "./abi.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";

const fail = errno => { throw Object.assign(new Error("Buttons request failed"), {errno}); };
const response = size => new Uint8Array(size);
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }), encoder = new TextEncoder();
const text = bytes => { try { return decoder.decode(bytes); } catch { return fail(E.EILSEQ); } };

// The page side of buttons@0: the one lease, what it shows and the presses its
// holder has not read. `show` draws { number, caption, buttons: [{ label,
// paste }], press }, or removes the strip for null; buttons change only with
// the layout's number. The view calls press(index) for a button, and
// press(index, text) for the page's Paste button with what the clipboard
// held, null when the browser gave nothing.
export function createButtonsProvider(show) {
  let held, generation = 0;

  function release(scope) {
    if (held?.scope !== scope) return;
    held = undefined;
    show(null);
  }
  function press(lease, layout, button, pasted) {
    if (held !== lease || lease.events.length >= B.DOLLY_BUTTONS_EVENTS) return;
    const bytes = pasted ? encoder.encode(pasted) : response(0);
    const status = pasted === null ? E.EACCES : bytes.length > B.DOLLY_BUTTONS_PASTE_BYTES ? E.E2BIG : 0;
    lease.events.push({ layout, button, kind: pasted === undefined ? B.DOLLY_BUTTON_PRESS : B.DOLLY_BUTTON_PASTE,
      status, text: status ? response(0) : bytes });
  }
  function dispatch(packet) {
    try {
      if (!(packet instanceof Uint8Array) || packet.byteLength < 32 || packet.byteLength > B.DOLLY_BUTTONS_PACKET_BYTES) fail(E.EINVAL);
      packet = packet.slice();
      const view = new DataView(packet.buffer);
      const op = view.getUint32(4, true), scope = view.getUint32(8, true), sequence = view.getUint32(16, true);
      if (view.getUint32(0, true) !== B.DOLLY_BUTTONS_VERSION || view.getUint32(12, true) || view.getUint32(20, true) ||
          !scope || !sequence || view.getUint32(24, true) !== packet.length - 32 || view.getUint32(28, true)) fail(E.EINVAL);
      let result = response(0);
      if (op === B.DOLLY_BUTTONS_OPEN) {
        if (packet.length !== 32) fail(E.EINVAL);
        if (scope <= generation) fail(E.ESTALE);
        if (held) fail(E.EBUSY);
        held = { scope, sequence, layout: 0, labels: "", events: [] };
        generation = scope;
        result = response(8);
        new DataView(result.buffer).setBigUint64(0, BigInt(scope), true);
      } else {
        if (held?.scope !== scope) fail(E.EBADF);
        if (sequence <= held.sequence) fail(E.ESTALE);
        held.sequence = sequence;
        if (op === B.DOLLY_BUTTONS_SHOW) {
          if (packet.length < 40) fail(E.EINVAL);
          const count = view.getUint32(32, true), captionBytes = view.getUint32(36, true);
          if (count > B.DOLLY_BUTTONS_MAX || captionBytes > B.DOLLY_BUTTONS_CAPTION_BYTES ||
              packet.length !== 40 + count * 28 + captionBytes) fail(E.EINVAL);
          const buttons = Array.from({ length: count }, (_, index) => {
            const kind = view.getUint32(40 + index * 28, true), label = packet.subarray(44 + index * 28, 68 + index * 28);
            const end = label.includes(0) ? label.indexOf(0) : label.length, paste = kind === B.DOLLY_BUTTON_PASTE;
            if ((!paste && kind !== B.DOLLY_BUTTON_PRESS) || (paste && end) || label.subarray(end).some(byte => byte)) fail(E.EINVAL);
            return { label: text(label.subarray(0, end)), paste };
          });
          const caption = text(packet.subarray(40 + count * 28)), labels = JSON.stringify(buttons);
          // A press names the buttons it was made on: only their change begins a layout.
          if (!held.layout || labels !== held.labels) ++held.layout;
          held.labels = labels;
          const lease = held, layout = held.layout;
          show(count || captionBytes
            ? { number: layout, caption, buttons, press: (button, pasted) => press(lease, layout, button, pasted) } : null);
          result = response(4);
          new DataView(result.buffer).setUint32(0, layout, true);
        } else if (op === B.DOLLY_BUTTONS_READ) {
          if (packet.length !== 32) fail(E.EINVAL);
          const event = held.events.shift();
          if (event) {
            result = response(20 + event.text.length);
            const output = new DataView(result.buffer);
            [event.layout, event.button, event.kind, event.status, event.text.length]
              .forEach((value, index) => output.setUint32(index * 4, value, true));
            result.set(event.text, 20);
          }
        } else if (op === B.DOLLY_BUTTONS_CLOSE) {
          if (packet.length !== 32) fail(E.EINVAL);
          release(scope);
        } else fail(E.ENOSYS);
      }
      return {bytes: result, error: 0};
    } catch (error) {
      if (!error.errno) console.warn("Dolly buttons:", error);
      return {bytes: response(0), error: error.errno ?? E.EIO};
    }
  }
  return {dispatch, release, close() { if (held) release(held.scope); },
    status: () => ({ held: Boolean(held), layout: held?.layout ?? 0, queued: held?.events.length ?? 0 })};
}
