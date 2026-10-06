import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { commandCases, pipelineCases, shellCases, shellQuote, sourceFiles } from "./fixtures/slop-cases.mjs";

// The shipped /bin/slop against the cases test/slop.test.mjs runs on src/slop.c natively.
await browserTest("slop", {}, async ({ open }) => {
  const { page, submit } = await open();
  // Ctrl+C stops a loop of builtins, which makes no system call, and the
  // shell keeps running.
  const looping = submit("while :; do :; done");
  await page.waitForFunction(() => __dolly.terminal.foregroundInterruptible());
  await page.locator("#keyboard").focus();
  await page.keyboard.press("Control+c");
  assert.equal(await looping, 130);
  assert.equal(await submit("true"), 0);
  const scratch = "/tmp/slop-cases";
  const write = (name, source) => `printf %b ${shellQuote(source.replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n").replaceAll("\t", "\\t"))} > ${scratch}/${name}`;
  assert.equal(await submit(`mkdir ${scratch}`), 0);
  for (const [name, source] of Object.entries(sourceFiles)) assert.equal(await submit(write(name, source)), 0, name);
  const failures = [];
  for (const [name, source, expected] of [...shellCases, ...commandCases, ...pipelineCases]) {
    const actual = await submit(`cd ${scratch}; ${write("fixture-zero", source)}; /bin/slop fixture-zero`);
    if (actual !== expected) failures.push({ name, expected, actual });
  }
  assert.deepEqual(failures, []);
  const make = `make -C ${scratch} SHELL=/bin/slop '.SHELLFLAGS=-e -c'`;
  assert.equal(await submit(`${make} all`), 0, "Make sourcing and .SHELLSTATUS");
  assert.equal(await submit(`${make} fail`), 2, "a failing assignment substitution fails the recipe");
  assert.equal(await submit(`grep -q SLOP-MAKE-OK make-success && test ! -e make-failed`), 0);
  // set -e at the prompt: a failing line stops there and the shell keeps running.
  assert.equal(await submit("set -e"), 0);
  assert.equal(await submit("false; echo reached > /tmp/after-failure"), 1);
  assert.equal(await submit("test ! -e /tmp/after-failure && set +e"), 0);
  // Blank input and comments keep the previous status.
  assert.equal(await submit("/bin/slop -c 'exit 173'"), 173);
  assert.equal(await submit(""), 173);
  assert.equal(await submit("  # no command"), 173);
  assert.equal(await submit("test $? -eq 173"), 0);
  assert.equal(await submit(`cd / && rm -rf ${scratch}`), 0);
});
