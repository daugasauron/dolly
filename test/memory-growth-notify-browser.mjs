// The kernel's memory grows in a Worker of its own while the runtime Worker
// waits (host/runtime/runtime.mjs). The grower's notify can come late, when
// that wait found the growth done already, and wake the wait for the next
// one. Here every notify of the grower comes again that late
// (test/fixtures/growth-notify-late.mjs) while `system` restores and a file
// grows by a mebibyte at a time.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";

const grower = await readFile(new URL("../host/runtime/grower.mjs", import.meta.url), "utf8");
const sourceOverrides = new Map([["/host/runtime/grower.mjs", `import "/test/fixtures/growth-notify-late.mjs";\n${grower}`]]);
await browserTest("memory-growth notify", { image: "system", server: { sourceOverrides } }, async ({ open }) => {
  const { submit } = await open();
  assert.equal(await submit("cat /usr/bin/* > /tmp/grown && rm /tmp/grown"), 0);
});
