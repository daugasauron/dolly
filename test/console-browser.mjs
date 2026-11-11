// console@0: a terminal the page holds into the session (host/console), with
// a shell started on it. Typing, the size, a resize, Ctrl+C and the end reach
// its programs as a pseudo-terminal's do.
// Usage: node test/console-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

// The size the program's terminal has, and again after SIGWINCH with `wait`.
const size = `#include <signal.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <unistd.h>
static volatile sig_atomic_t resized;
static void on_resize(int number) { (void)number; resized = 1; }
static int show(void) {
  struct winsize size;
  if (ioctl(STDIN_FILENO, TIOCGWINSZ, &size) != 0) return 1;
  printf("SIZE %ux%u\\n", size.ws_col, size.ws_row);
  return fflush(stdout);
}
int main(int argc, char **argv) {
  (void)argv;
  signal(SIGWINCH, on_resize);
  if (show() != 0 || argc == 1) return 0;
  puts("WAITING");
  fflush(stdout);
  while (!resized) usleep(10000);
  return show();
}`;

await browserTest("console", { image: "system", timeout: 300_000 }, async ({ open }) => {
  const { page } = await open(await composed(["console"], [], { base: "system", files: { "/home/dolly/size.c": size } }));
  const seen = await page.evaluate(async () => {
    const decoder = new TextDecoder();
    const handle = await __dolly.openConsole({ columns: 100, rows: 30, argv: ["/bin/slop"] });
    const reader = handle.output.getReader();
    let text = "";
    const until = async pattern => {
      while (!pattern.test(text)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`the console ended: ${JSON.stringify(text)}`);
        text += decoder.decode(value, { stream: true });
      }
      const shown = text;
      text = "";
      return shown;
    };
    const type = async line => { for (let rest = new TextEncoder().encode(line); rest.length;) rest = rest.subarray(await handle.write(rest)); };
    const prompt = "dolly\\x1b\\[0m:[^\\n]*\\$ ";
    const seen = [await until(new RegExp(prompt))];
    await type("echo con$((6 * 7))sole\r");
    seen.push(await until(new RegExp(`con42sole[\\s\\S]*${prompt}`)));
    await type("cc -O0 /home/dolly/size.c -o /tmp/size && /tmp/size\r");
    seen.push(await until(new RegExp(`SIZE 100x30[\\s\\S]*${prompt}`)));
    await type("/tmp/size wait\r");
    seen.push(await until(/WAITING/));
    await handle.resize(120, 40);
    seen.push(await until(new RegExp(`SIZE 120x40[\\s\\S]*${prompt}`)));
    // Ctrl+C ends the command the shell waits for, not the shell.
    await type("sleep 30\r");
    await new Promise(resolve => setTimeout(resolve, 500));
    await type("\x03");
    await until(new RegExp(prompt));
    await type("echo status $?\r");
    seen.push(await until(new RegExp(`status 130[\\s\\S]*${prompt}`)));
    await type("exit 3\r");
    for (let read; !(read = await reader.read()).done;) text += decoder.decode(read.value, { stream: true });
    return { seen, status: await handle.exited };
  });
  assert.equal(seen.status, 3, seen.seen.join("\n---\n"));
});
