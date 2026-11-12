// Files live in kernel memory. Growing one past what memory can hold fails the
// write with ENOSPC; the kernel, the shell and later commands keep working
// (test/cases/fs-growth.json).
import assert from "node:assert/strict";
import { browserTest, runSteps } from "./browser.mjs";
import { DOLLY_ERRNO } from "../src/process-constants.mjs";
import growthCases from "./cases/fs-growth.json" with { type: "json" };

await browserTest("fs-growth", { image: growthCases.image, server: { fixtures: growthCases.fixtures }, timeout: 300_000 },
  async ({ server, open }) => {
  const { page, submit } = await open({
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const failures = [];
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  // The growths that fit, then, while kernel memory is still small, a timed append around a
  // refused growth, then the refusals and the file that fills memory.
  await runSteps(submit, server.origin, { ...growthCases, steps: growthCases.steps.slice(0, 3) });
  // A growth that cannot fit takes no memory before it is refused: kernel
  // memory left at its maximum made the same append fifteen times slower in Chrome.
  const run = async command => assert.equal(await submit(command), 0, command);
  const timed = async command => { const started = performance.now(); await run(command); return performance.now() - started; };
  const before = await timed("./fs-growth append timed 1024 && rm timed");
  assert.equal(await submit("./fs-growth size huge 9000"), DOLLY_ERRNO.ENOSPC);
  const after = await timed("rm huge && ./fs-growth append timed 1024 && rm timed");
  assert.ok(after < 4 * before + 500, `a 1 GiB append took ${before.toFixed(0)} ms, and ${after.toFixed(0)} ms after a refused growth`);
  await runSteps(submit, server.origin, { ...growthCases, steps: growthCases.steps.slice(3) });
  assert.deepEqual(failures, []);
  await run("cd / && rm -r /tmp/fs-growth");
});
