// Paging at the real terminal of the image people open. Git and man page only
// to a terminal, so every command here is typed there and none is captured:
// without less they print straight through; after amy install less the pager
// holds the screen, a key scrolls it and q returns to the prompt. Nothing in
// the environment asks for it, a pager the person names is the one used, and
// output that is not a terminal never waits for a key.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

await browserTest("pager", { timeout: 300_000 }, async ({ open }) => {
  const { page, submit, text } = await open();
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  // Starts a command and resolves to its status; settled says whether it ended.
  const start = command => {
    const running = Object.assign(submit(command), { settled: false });
    running.then(() => { running.settled = true; });
    return running;
  };
  const press = async key => { await page.locator("#keyboard").focus(); await page.keyboard.press(key); };
  // The rows of the screen once it shows what is expected of it.
  const rows = async (expected, description) => {
    for (const deadline = Date.now() + 15000;;) {
      const screen = (await text()).split("\n");
      if (expected(screen)) return screen;
      if (Date.now() > deadline) throw new Error(`the terminal never showed ${description}:\n${screen.join("\n")}`);
      await page.waitForTimeout(50);
    }
  };
  const size = () => page.evaluate(() => __dolly.transport.dimensions().rows);
  // A full screen of the numbered lines from FIRST on, less's own row below them.
  const pageFrom = async first => {
    const count = await size() - 1;
    return rows(screen => screen.length === count + 1 &&
      screen.slice(0, count).every((row, index) => row === String(first + index)), `the page from line ${first}`);
  };
  // Typed at the terminal, COMMAND prints through to its last line and ends.
  const printsThrough = async (command, last) => {
    await run("clear");
    await run(command);
    assert.match(await text(), last, command);
  };
  // COMMAND holds the screen at the first lines of its output, Space moves on
  // and q ends it with status 0.
  const pages = async (command, first, later) => {
    await run("clear");
    const running = start(command);
    await rows(screen => first.test(screen.join("\n")) && !later.test(screen.join("\n")), `the first page of ${command}`);
    assert.equal(running.settled, false, `${command} did not wait`);
    await press("Space");
    await rows(screen => !first.test(screen.join("\n")), `the next page of ${command}`);
    assert.equal(running.settled, false, `${command} ended at a key`);
    await press("q");
    assert.equal(await running, 0, command);
  };

  await run("amy install git > /dev/null && git config --global user.name Dolly");
  await run("git config --global user.email dolly@example.invalid && mkdir /tmp/pager && cd /tmp/pager");
  // Sixty commits, a file that grows by a line in each, three hundred lines:
  // more than a screen of log, of diff and of page.
  await run("git init -q . && seq 1 300 > /tmp/lines && cp /tmp/lines /usr/share/man/cat1/lines.1");
  // The package's Git commits without a word: it holds the system configuration.
  await run("for n in $(seq 101 160); do seq 1 $n > file && git add file && git commit -qm change-$n; done 2> /tmp/said");
  await run("test ! -s /tmp/said");
  const unset = "test -z \"$PAGER$GIT_PAGER$LESS\"";
  await run(unset);

  // No pager is installed: what would be paged is printed, with status 0.
  for (const [command, last] of [["git log", /change-101\n/], ["git log -n3", /change-158\n/], ["git diff HEAD~1", /\+160\n/],
    ["git show", /\+160\n/], ["git branch", /^\* \S+\n/m], ["git help -a", /\n.+\n.+\n/], ["man lines", /\n300\n/]]) {
    await printsThrough(command, last);
  }

  await run(`amy install less > /dev/null && ${unset}`);
  await pages("git log", /change-160\n/, /change-101\n/);
  await pages("git diff HEAD~59", /\+102\n/, /\+160\n/);
  await pages("man lines", /^1\n2\n/, /\n300\n/);
  await pages("seq 1 300 | less", /^1\n2\n/, /\n300\n/);
  // What fits the screen is not held, under Git's LESS=FRX.
  await printsThrough("git log -n1", /change-160\n/);
  await printsThrough("git branch", /^\* \S+\n/m);
  await printsThrough("man echo", /\n.+\n/);

  // less itself: forward, back, a search, a window of another size, quit.
  await run("clear");
  const reading = start("less /tmp/lines");
  const height = await size();
  await pageFrom(1);
  await press("Space");
  await pageFrom(height);
  await press("b");
  await pageFrom(1);
  await press("Slash");
  await page.keyboard.type("250");
  await press("Enter");
  await pageFrom(250);
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width, height: Math.round(viewport.height * 0.6) });
  await page.waitForFunction(rows => __dolly.transport.dimensions().rows < rows, height);
  await pageFrom(250);
  assert.equal(reading.settled, false);
  await press("q");
  assert.equal(await reading, 0);
  await page.setViewportSize(viewport);
  await page.waitForFunction(rows => __dolly.transport.dimensions().rows === rows, height);

  // A pager the person names is the one that runs: these end without a key.
  for (const command of ["PAGER=cat git log", "GIT_PAGER=cat git log", "git -c core.pager=cat log", "PAGER=cat man lines"]) {
    await printsThrough(command, command.endsWith("log") ? /change-101\n/ : /\n300\n/);
  }
  // Not a terminal: nothing is paged and nothing waits, as in a tool call.
  await run("test \"$(git log | grep -c change-)\" = 60 && git show > /tmp/shown && grep -q change-160 /tmp/shown");
  await run("man lines | cmp - /tmp/lines && man lines > /tmp/page && cmp /tmp/page /tmp/lines");
  await run("less /tmp/lines | cmp - /tmp/lines && seq 1 300 | less > /tmp/page && cmp /tmp/page /tmp/lines");
});
