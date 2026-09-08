import assert from "node:assert/strict";
import test from "node:test";
import studio from "../src/studio/pi-extension.js";

test("Studio help is a one-shot TUI notification, not a persistent widget", () => {
  let start;
  const notices = [];
  studio({ on(event, callback) { assert.equal(event, "session_start"); start = callback; } });
  const ui = { notify: text => notices.push(text) };
  start({}, { mode: "print", ui });
  assert.equal(notices.length, 0);
  start({}, { mode: "tui", ui });
  start({}, { mode: "tui", ui });
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Dollyfile Studio/);
});
