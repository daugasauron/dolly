import assert from "node:assert/strict";
import { browserTest, runSteps } from "./browser.mjs";
import cpp from "./cases/cpp.json" with { type: "json" };

// The C and C++ toolchain's cases (test/cases/cpp.json).
await browserTest("cpp", { image: "system", server: { fixtures: cpp.fixtures } }, async ({ name, server, open }) => {
  const { submit } = await open();
  await runSteps(submit, cpp);
  // An ordinary program runs on its Worker's own stack, which holds 5,000 of
  // deep.c's calls in Firefox and not in Chrome (3,700 do): the browser's.
  assert.equal(await submit("./deep 5000"), name === "chromium" ? 126 : 0);
  assert.equal(await submit("cd / && rm -rf /tmp/make"), 0);
});
