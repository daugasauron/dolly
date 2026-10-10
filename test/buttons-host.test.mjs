import assert from "node:assert/strict";
import test from "node:test";
import * as B from "../host/buttons/abi.mjs";
import { createButtonsProvider } from "../host/buttons/provider.mjs";
import { DOLLY_ERRNO as E } from "../src/process-constants.mjs";

// What a hostile guest can reach through buttons@0, tried at the page's provider.
test("the buttons provider admits bounded text, queues 16 presses and ends with its lease", () => {
  let sequence = 0, shown;
  const provider = createButtonsProvider(layout => { shown = layout; });
  function packet(op, scope = 1, body = []) {
    const bytes = new Uint8Array(32 + body.length), view = new DataView(bytes.buffer);
    view.setUint32(4, op, true); view.setUint32(8, scope, true); view.setUint32(16, ++sequence, true);
    view.setUint32(24, body.length, true);
    bytes.set(body, 32);
    return bytes;
  }
  const altered = (bytes, offset, value) => { new DataView(bytes.buffer).setUint32(offset, value, true); return bytes; };
  // A SHOW body: buttons are [kind, label bytes], the caption is bytes.
  function layout(buttons, caption = []) {
    const body = new Uint8Array(8 + buttons.length * 28 + caption.length), view = new DataView(body.buffer);
    view.setUint32(0, buttons.length, true); view.setUint32(4, caption.length, true);
    buttons.forEach(([kind, label], index) => { view.setUint32(8 + index * 28, kind, true); body.set(label, 12 + index * 28); });
    body.set(caption, 8 + buttons.length * 28);
    return body;
  }
  const utf8 = text => new TextEncoder().encode(text);
  const press = label => [B.DOLLY_BUTTON_PRESS, utf8(label)], paste = [B.DOLLY_BUTTON_PASTE, []];
  const error = bytes => provider.dispatch(bytes).error;
  const show = (...body) => error(packet(B.DOLLY_BUTTONS_SHOW, 1, layout(...body)));
  const number = (...body) => new DataView(provider.dispatch(packet(B.DOLLY_BUTTONS_SHOW, 1, layout(...body))).bytes.buffer).getUint32(0, true);
  function read() {
    const { bytes, error } = provider.dispatch(packet(B.DOLLY_BUTTONS_READ));
    assert.equal(error, 0);
    if (!bytes.length) return null;
    const [layout, button, kind, status, length] = new Uint32Array(bytes.slice(0, 20).buffer);
    assert.equal(bytes.length, 20 + length);
    return { layout, button, kind, status, text: new TextDecoder().decode(bytes.subarray(20)) };
  }

  assert.equal(error(packet(B.DOLLY_BUTTONS_READ)), E.EBADF, "a read without a lease");
  for (const [offset, value] of [[0, 1], [12, 1], [20, 1], [24, 4], [28, 1]]) {
    assert.equal(error(altered(packet(B.DOLLY_BUTTONS_OPEN), offset, value)), E.EINVAL, `a malformed open at ${offset}`);
  }
  assert.equal(error(new Uint8Array(B.DOLLY_BUTTONS_PACKET_BYTES + 1)), E.EINVAL, "an oversized packet");
  assert.equal(error(packet(B.DOLLY_BUTTONS_OPEN)), 0);
  assert.equal(error(packet(B.DOLLY_BUTTONS_OPEN, 2)), E.EBUSY, "a second holder");
  assert.equal(error(packet(9)), E.ENOSYS, "an unknown operation");
  const replayed = packet(B.DOLLY_BUTTONS_READ);
  assert.deepEqual([error(replayed), error(replayed)], [0, E.ESTALE], "sequence replay");

  assert.equal(show(Array(13).fill(press("x"))), E.EINVAL, "13 buttons");
  assert.equal(show([], new Uint8Array(481)), E.EINVAL, "a caption of 481 bytes");
  assert.equal(error(packet(B.DOLLY_BUTTONS_SHOW, 1, [...layout([press("x")]), 0])), E.EINVAL, "bytes after the caption");
  assert.equal(show([[3, utf8("x")]]), E.EINVAL, "an unknown kind");
  assert.equal(show([[B.DOLLY_BUTTON_PRESS, [120, 0, 120]]]), E.EINVAL, "bytes after a label's end");
  assert.equal(show([[B.DOLLY_BUTTON_PASTE, utf8("Send")]]), E.EINVAL, "a name for the Paste button");
  assert.equal(show([[B.DOLLY_BUTTON_PRESS, [0xff]]]), E.EILSEQ, "a label that is not UTF-8");
  assert.equal(show([], [0xc3]), E.EILSEQ, "a caption that is not UTF-8");
  assert.equal(shown, undefined, "a refused layout was shown");

  // A layout is its buttons: a caption does not begin one.
  const first = number([press("é".repeat(12)), paste], utf8("<b>caption</b>"));
  assert.deepEqual([first, shown.caption, shown.buttons], [1, "<b>caption</b>", [{ label: "é".repeat(12), paste: false }, { label: "", paste: true }]]);
  assert.equal(number([press("é".repeat(12)), paste], utf8("another")), first);
  assert.equal(number([press("One"), paste], utf8("another")), first + 1);

  // Presses queue up to 16; a Paste carries the clipboard's text, a refusal or its excess.
  for (let button = 0; button < 17; ++button) shown.press(button);
  assert.equal(provider.status().queued, B.DOLLY_BUTTONS_EVENTS);
  for (let button = 0; button < 16; ++button) {
    assert.deepEqual(read(), { layout: first + 1, button, kind: B.DOLLY_BUTTON_PRESS, status: 0, text: "" });
  }
  assert.equal(read(), null);
  shown.press(1, "ü".repeat(2048)); shown.press(1, "x".repeat(4097)); shown.press(1, null); shown.press(1, "");
  assert.deepEqual([read(), read(), read(), read()].map(({ kind, status, text }) => [kind, status, text]),
    [[2, 0, "ü".repeat(2048)], [2, E.E2BIG, ""], [2, E.EACCES, ""], [2, 0, ""]]);

  // Hidden by an empty layout, removed with the lease; a late press reaches nobody.
  const pressLate = shown.press;
  assert.equal(show([]), 0);
  assert.equal(shown, null);
  assert.equal(show([press("One")]), 0);
  provider.release(1);
  assert.equal(shown, null);
  pressLate(0);
  assert.deepEqual(provider.status(), { held: false, layout: 0, queued: 0 });
  assert.equal(error(packet(B.DOLLY_BUTTONS_READ)), E.EBADF, "a revoked lease read");
  assert.equal(error(packet(B.DOLLY_BUTTONS_OPEN)), E.ESTALE, "a lease was reused");
  assert.equal(error(packet(B.DOLLY_BUTTONS_OPEN, 2)), 0);
  provider.release(1);
  assert.equal(error(packet(B.DOLLY_BUTTONS_READ, 2)), 0, "a stale revocation ended a new lease");
  assert.equal(error(packet(B.DOLLY_BUTTONS_CLOSE, 2)), 0);
  assert.equal(provider.status().held, false);
});
