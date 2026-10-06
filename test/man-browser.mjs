// man and --help in the image people open: every command on PATH has a page,
// Dolly's own commands answer --help, and a package's pages arrive with it.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// Each loop leaves the names that failed in a file and prints them.
const everyCommandHasAPage = "rm -f /tmp/pageless; for file in /bin/* /usr/bin/*; do name=${file##*/}; " +
  "man \"$name\" > /tmp/page && test -s /tmp/page || echo \"$name\" >> /tmp/pageless; done; ! cat /tmp/pageless 2> /dev/null";
// Dolly's own pages are the plain ones; test and [ take --help as an expression.
const everyOwnCommandAnswersHelp = "rm -f /tmp/helpless; for page in /usr/share/man/cat1/*.1; do name=${page##*/}; " +
  "name=${name%.1}; if test \"$name\" != test && test \"$name\" != \"[\"; then \"$name\" --help > /tmp/help && " +
  "test -s /tmp/help || echo \"$name\" >> /tmp/helpless; fi; done; ! cat /tmp/helpless 2> /dev/null";

await browserTest("man and --help", { timeout: 300_000 }, async ({ open }) => {
  const { submit, text } = await open();
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  await run(everyCommandHasAPage);
  await run(everyOwnCommandAnswersHelp);
  await run("man foreground > /tmp/page && foreground --help > /tmp/help && cmp /tmp/page /tmp/help");
  await run("man help > /tmp/page && help > /tmp/help && cmp /tmp/page /tmp/help");
  await run("man grep > /tmp/page && cmp /tmp/page /usr/share/man/man1/grep.1");
  assert.equal(await submit("man no-such-command > /tmp/out 2> /tmp/err"), 1);
  await run("grep -q no-such-command /tmp/err && test ! -s /tmp/out");
  for (const wrong of ["man", "man grep sed", "help grep", "foreground", "amy", "dollyfile", "xargs --no-such-option"]) {
    assert.equal(await submit(`${wrong} > /tmp/out 2> /tmp/err`), 2, wrong);
    await run("test -s /tmp/err && test ! -s /tmp/out");
  }
  assert.equal(await submit("man rg > /dev/null 2>&1"), 1);
  await run("amy install ripgrep && man rg > /tmp/page && rg --help > /tmp/help && cmp /tmp/page /tmp/help");
  await run(everyCommandHasAPage);
  await run(everyOwnCommandAnswersHelp);
});
