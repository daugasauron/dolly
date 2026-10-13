// Files live in kernel memory. Growing one past what memory can hold fails the
// write with ENOSPC; the kernel, the shell and later commands keep working.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { DOLLY_ERRNO } from "../src/process-constants.mjs";

const fixtures = { "fs-growth.c": "test/fixtures/fs-growth.c" };
await browserTest("fs-growth", { image: "system", server: { fixtures }, timeout: 300_000 }, async ({ server, open }) => {
  const { page, submit } = await open({
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const failures = [];
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir /tmp/fs-growth && cd /tmp/fs-growth && curl -fsS ${server.origin}/fixture/fs-growth.c -o fs-growth.c && cc -O2 fs-growth.c -o fs-growth`);
  await run("./fs-growth append under 2047 && test $(stat -c %s under) = 2146435072 && rm under");
  await run("./fs-growth size sized 3072 && test $(stat -c %s sized) = 3221225472 && rm sized");
  // A growth that cannot fit takes no memory before it is refused: kernel
  // memory left at its maximum made the same append fifteen times slower in Chrome.
  const timed = async command => { const started = performance.now(); await run(command); return performance.now() - started; };
  const before = await timed("./fs-growth append timed 1024 && rm timed");
  assert.equal(await submit("./fs-growth size huge 9000"), DOLLY_ERRNO.ENOSPC);
  const after = await timed("rm huge && ./fs-growth append timed 1024 && rm timed");
  assert.ok(after < 4 * before + 500, `a 1 GiB append took ${before.toFixed(0)} ms, and ${after.toFixed(0)} ms after a refused growth`);
  assert.equal(await submit("./fs-growth append full 16384"), DOLLY_ERRNO.ENOSPC);
  assert.deepEqual(failures, []);
  // Appending needs no second copy of the file: it filled most of 8 GiB.
  await run("test $(stat -c %s full) -gt 6442450944 && rm full && ./fs-growth append under 2047 && rm under");
  await run("cd / && rm -r /tmp/fs-growth");
});
