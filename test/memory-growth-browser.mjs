// Kernel memory past twice V8's old space leaves system calls as fast as they
// were: the kernel's memory grows in a Worker of its own (host/runtime/runtime.mjs).
// Chrome's old space is held to 1 GiB here, as a phone's is, so 2.5 GiB is past it.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

const fixtures = { "fs-growth.c": "test/fixtures/fs-growth.c" };
await browserTest("memory-growth", { image: "system", server: { fixtures }, timeout: 300_000,
  launch: { chromium: ["--js-flags=--max-old-space-size=1024"] } }, async ({ server, open }) => {
  const { submit } = await open({ policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const run = async command => assert.equal(await submit(command), 0, command);
  const timed = async command => { const started = performance.now(); await run(command); return performance.now() - started; };
  await run(`mkdir /tmp/memory-growth && cd /tmp/memory-growth && curl -fsS ${server.origin}/fixture/fs-growth.c -o fs-growth.c && cc -O2 fs-growth.c -o fs-growth`);
  const before = await timed("./fs-growth append timed 256 && rm timed");
  await run("./fs-growth size grown 2560 && rm grown");
  const after = await timed("./fs-growth append timed 256 && rm timed");
  assert.ok(after < 3 * before + 500, `256 MiB of writes took ${before.toFixed(0)} ms, and ${after.toFixed(0)} ms past 2.5 GiB`);
  await run("cd / && rm -r /tmp/memory-growth");
});
