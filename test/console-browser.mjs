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

// A pipe console: what is written is the program's standard input, byte for
// byte, until its end; standard output and error come back apart.
await browserTest("console pipes", { image: "system", timeout: 300_000 }, async ({ open }) => {
  const { page } = await open(await composed(["console"], [], { base: "system" }));
  const seen = await page.evaluate(async () => {
    const read = async stream => {
      const decoder = new TextDecoder(), reader = stream.getReader();
      let text = "";
      for (let chunk; !(chunk = await reader.read()).done;) text += decoder.decode(chunk.value, { stream: true });
      return text;
    };
    const run = async (argv, input) => {
      const handle = await __dolly.openConsole({ pipes: true, argv });
      const output = read(handle.output), errors = read(handle.errors);
      if (input !== undefined) await handle.write(input);
      await handle.endInput();
      return { output: await output, errors: await errors, status: await handle.exited };
    };
    const cat = await run(["/bin/cat"], "typed\nline two\n");
    const split = await run(["/bin/slop", "-c", "echo out; echo err >&2; test -t 0 || echo not a terminal; exit 4"]);
    // The host stops reading: the program's next write is EPIPE, and SIGPIPE ends it.
    const endless = await __dolly.openConsole({ pipes: true, argv: ["/bin/slop", "-c", "while :; do echo y; done"] });
    const reader = endless.output.getReader();
    await reader.read();
    await endless.close();
    // Without a terminal's interrupt key, interrupt() applies Ctrl+C's rules: SIGINT ends the program.
    const sleeper = await __dolly.openConsole({ pipes: true, argv: ["/bin/slop", "-c", "echo started; sleep 30"] });
    const sleeping = read(sleeper.output);
    await new Promise(resolve => setTimeout(resolve, 500));
    await sleeper.interrupt();
    // The page holds at most its window of a console's output: a program writing more than
    // anyone reads waits, and every byte comes once the page reads.
    const flood = await __dolly.openConsole({ pipes: true, argv: ["/bin/slop", "-c", "yes | head -n 10000000"] });
    await new Promise(resolve => setTimeout(resolve, 3000));
    const early = await Promise.race([flood.exited.then(() => "exited"), new Promise(resolve => setTimeout(() => resolve("waiting"), 100))]);
    const flooded = flood.output.getReader();
    let bytes = 0;
    for (let chunk; !(chunk = await flooded.read()).done;) bytes += chunk.value.length;
    return { cat, split, endless: await endless.exited, interrupted: { output: await sleeping, status: await sleeper.exited },
      flood: { early, bytes, status: await flood.exited } };
  });
  assert.deepEqual(seen.cat, { output: "typed\nline two\n", errors: "", status: 0 });
  assert.deepEqual(seen.split, { output: "out\nnot a terminal\n", errors: "err\n", status: 4 });
  assert.equal(seen.endless, 141);
  assert.deepEqual(seen.interrupted, { output: "started\n", status: 130 });
  assert.deepEqual(seen.flood, { early: "waiting", bytes: 20_000_000, status: 0 });
});
