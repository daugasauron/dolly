import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import studio from "../pi-extension.js";

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
});

test("the Studio archive holds every module its lint and build commands import", async () => {
  const staging = await readFile(new URL("../prepare-sources.sh", import.meta.url), "utf8");
  // Rows "CHECKOUT-PATH /usr/share/dollyfile-studio/PATH": staged path -> checkout path.
  const staged = new Map([...staging.matchAll(/^\s+(\S+) \/usr\/share\/dollyfile-studio\/(\S+\.mjs) /gm)]
    .map(([, source, path]) => [path, source]));
  const pending = ["lint.mjs", "build.mjs"], seen = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    assert.ok(staged.has(path), `${path} is imported but not staged`);
    const source = await readFile(new URL(`../../../${staged.get(path)}`, import.meta.url), "utf8");
    for (const [, specifier] of source.matchAll(/\bfrom "(\.[^"]+)"/g)) pending.push(join(dirname(path), specifier));
  }
});
