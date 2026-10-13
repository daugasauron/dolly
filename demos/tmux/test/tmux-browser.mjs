// tmux in the tmux-panes image, in Chrome and Firefox: the image opens into
// two panes with a shell on a pseudo-terminal in each. Typing reaches the
// active pane; Ctrl+C ends the program in a pane and not its shell; a resize
// of the window reaches the program in a pane; detached, the shells keep
// running, and attach returns to them. Then, in Chrome, the tmux package:
// refused by default, and installed into a default that declares pty@0.
// Usage: node demos/tmux/test/tmux-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { demoTest, shellPrompt, writeCommand } from "../../browser.mjs";
import { siteReference } from "../../../src/static-asset.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];

// Prints its terminal's size, and again after each of two resizes.
const sizeProgram = `
#include <signal.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <unistd.h>
static volatile sig_atomic_t resizes;
static void resized(int number) { (void)number; ++resizes; }
int main(void) {
  struct sigaction action = {.sa_handler = resized};
  sigaction(SIGWINCH, &action, NULL);
  for (int count = 0; count < 3; ++count) {
    struct winsize size;
    if (!isatty(1) || ioctl(1, TIOCGWINSZ, &size) != 0) return 1;
    printf("SIZE-%d %dx%d\\n", count, size.ws_col, size.ws_row);
    fflush(stdout);
    while (count < 2 && resizes <= count) pause();
  }
  return 0;
}`;

for (const browser of browsers) {
  await demoTest("tmux", { image: "tmux-panes", timeout: 300_000, browser }, async ({ open }) => {
    const { page, run, submit, text, start, prompt, waitText, input } = await open({ prompt: null });
    const prefix = async key => { await page.keyboard.press("Control+b"); await page.keyboard.press(key); };
    // In a line of the screen: left of the panes' border, or right of it.
    const left = text => new RegExp(`^${text}[^│\\n]*│`, "m"), right = text => new RegExp(`│${text}`);

    // The image's entry: the status line, and the welcome typed into the right pane.
    await waitText(/│tmux inside Dolly[\s\S]*\[0\] 0:slop\*/);
    const results = () => page.evaluate(() => __dolly.terminal.currentResultSequence());
    const published = await results();
    await input("tmux display -p RIGHT-#{pane_tty}\r");
    await waitText(right("RIGHT-/dev/pts/1"));
    await prefix("o");
    await input("tmux display -p LEFT-#{pane_tty}; only=left\r");
    await waitText(left("LEFT-/dev/pts/0"));

    // Each pane is its own shell: a variable of one is not the other's.
    await input("echo SEES-$only-\r");
    await waitText(left("SEES-left-"));
    await prefix("o");
    await input("echo SEES-$only-\r");
    await waitText(right("SEES--"));

    // Ctrl+C is for the program in the pane; its shell reads the next line.
    await input("sleep 100\r");
    await waitText(right("[^\\n]*\\$ sleep 100"));
    await page.keyboard.press("Control+c");
    await input("echo INTERRUPTED-$?\r");
    await waitText(right("INTERRUPTED-130"));

    // The window resized: the program in the pane takes SIGWINCH and reads its new size.
    await input(`${writeCommand("/tmp/size.c", sizeProgram)} && cc /tmp/size.c -o /tmp/size && clear && /tmp/size\r`);
    const [, columns, rows] = /│SIZE-0 (\d+)x(\d+)/.exec(await waitText(right("SIZE-0 \\d+x\\d+")));
    await page.setViewportSize({ width: 1000, height: 600 });
    const [, narrower, shorter] = /│SIZE-1 (\d+)x(\d+)/.exec(await waitText(right("SIZE-1 \\d+x\\d+")));
    assert.ok(Number(narrower) < Number(columns) && Number(shorter) < Number(rows), `${columns}x${rows} to ${narrower}x${shorter}`);
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitText(right(`SIZE-2 \\d+x${rows}`));

    // What a shell in a pane ran is not a result of the page's terminal.
    assert.equal(await results(), published);

    // Detached, the shells keep running: one writes a file meanwhile.
    await input("sleep 2; echo KEPT > /tmp/tmux-kept\r");
    await prefix("d");
    await prompt(shellPrompt);
    await waitText(/\[detached \(from session 0\)\][\s\S]*tmux attach returns/);
    await run("test \"$(tmux list-panes -F '#{pane_tty}:#{pane_dead}' | tr '\\n' ' ')\" = '/dev/pts/0:0 /dev/pts/1:0 '");
    await run("until test -s /tmp/tmux-kept; do sleep 1; done; grep -qx KEPT /tmp/tmux-kept");

    // The entry started the server beside this shell, not under it: Ctrl+C
    // for a command of the shell does not reach the server or its panes.
    const sleeping = start("sleep 50");
    await waitText(/\$ sleep 50\s*$/);
    await page.keyboard.press("Control+c");
    assert.equal(await sleeping.done, 130);
    await run("test \"$(tmux list-panes -F '#{pane_dead}' | tr '\\n' ' ')\" = '0 0 '");

    // Jobs start by spawn: run-shell prints what its command wrote, if-shell
    // takes the branch its command's status chooses, and #() puts a command's
    // output in the status line. pipe-pane forks by itself, and says so.
    await run("test \"$(tmux run-shell 'echo JOB-$((6 * 7))')\" = JOB-42");
    await run("tmux if-shell 'test -d /tmp' 'set -g @chosen yes' 'set -g @chosen no' && test \"$(tmux show -gv @chosen)\" = yes");
    await run("tmux if-shell 'test -d /nowhere' 'set -g @chosen yes' 'set -g @chosen no' && test \"$(tmux show -gv @chosen)\" = no");
    await run("tmux set -g status-right '#(echo STATUS-$((6 * 7))) #S'");
    assert.equal(await submit("tmux pipe-pane 'cat > /tmp/piped' 2> /tmp/refused"), 1, await text());
    await run("grep -q 'fork error' /tmp/refused");

    // Attached again, the panes are as they were left and take input.
    const attached = start("tmux attach");
    await waitText(right(`SIZE-2 \\d+x${rows}`));
    await waitText(/STATUS-42/);
    await input("echo ATTACHED-$((6 * 7))\r");
    await waitText(right("ATTACHED-42"));

    // A pane goes with its shell, and the session with its last pane.
    await input("exit\r");
    await waitText(/^(?![\s\S]*│)[\s\S]*\[0\] 0:slop\*/);
    await input("exit\r");
    assert.equal(await attached.done, 0);
    await waitText(/\[exited\]/);
  });
}

if (browsers.includes("chromium")) {
  const { DOLLY_IMAGES } = await import("../../../dist/dolly-images.mjs");
  const pin = name => {
    const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
    return `${siteReference(dollyfile)} ${sha256}`;
  };
  // Host requirements are never inherited: the probe restates default's, and
  // adds the one tmux needs that default does not declare.
  const hosts = [...DOLLY_IMAGES.find(definition => definition.image === "default").hostRequirements, "pty@0"];
  const recipe = ["DOLLY 7", "APPLICATION tmux-probe", ...hosts.map(host => `REQUIRES HOST ${host}`),
    `FROM ${pin("default")}`, `INSTALL ${pin("tmux")}`, "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
  await demoTest("tmux package", { image: "default", timeout: 300_000 }, async ({ open }) => {
    // default declares no pty@0: amy refuses the package there, naming the module.
    const session = await open();
    assert.notEqual(await session.submit("amy install tmux 2> /tmp/refused"), 0, await session.text());
    await session.run("grep -q 'needs pty@0' /tmp/refused && ! command -v tmux");

    const { run, submit, text } = await open({ path: "/custom/rebuild/", prompt: shellPrompt,
      setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) });
    // No fork: tmux says how its server is started, and the shell starts it.
    assert.equal(await submit("tmux new-session -d 2> /tmp/refused"), 1, await text());
    await run("grep -q 'tmux -D &' /tmp/refused");
    await run("tmux -D & until test -e /tmp/tmux-0/default; do sleep 1; done; tmux new-session -d");
    await run("tmux send-keys 'echo PACKAGE-$((6 * 7)) > /tmp/tmux-package' Enter");
    await run("until test -s /tmp/tmux-package; do sleep 1; done; grep -qx PACKAGE-42 /tmp/tmux-package");
    await run("tmux kill-server; wait");
    // Its manual page was formatted when the package was built: text, no macros.
    await run("man tmux > /tmp/page && grep -q 'terminal multiplexer' /tmp/page && ! grep -Eq '^[.](Dd|Sh) ' /tmp/page");
  });
}

// In default, as a person installs it: nena gives the session pty@0, and ps
// lists the server the shell starts until tmux has ended it.
for (const browser of browsers) {
  await demoTest("tmux in ps", { image: "default", timeout: 300_000, browser }, async ({ open }) => {
    const { run } = await open();
    await run("nena enable pty && amy install tmux");
    await run("tmux -D & until test -e /tmp/tmux-0/default; do sleep 1; done; ps | grep -qx \"$! $$ running tmux -D\"");
    await run("tmux kill-server; while ps | grep -q \"^$! \"; do sleep 1; done; wait");
  });
}
