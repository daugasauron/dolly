import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { browserTest } from "./browser.mjs";
import { tarArchive } from "./fixtures/tar.mjs";
import { shellQuote } from "./fixtures/slop-cases.mjs";
import { DOLLY_ERRNO } from "../src/process-constants.mjs";

const scratch = "/tmp/dolly-process-test";
const fixtures = Object.fromEntries(["process-lifecycle.c", "process-descriptors.c", "process-signals.c", "process-sigchld.c", "process-interrupt.c"]
  .map(name => [name, `test/fixtures/${name}`]));
for (const name of await readdir(new URL("../build", import.meta.url))) {
  if (/^(?:process|dso)-.+\.wasm$/.test(name)) fixtures[name] = `build/${name}`;
}
// C sees the same errno values as the browser, and process calls report
// errors through their result; argv[1] waits in a raw clock sleep for SIGINT.
const errorsSource = `#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>
#include <dolly/process.h>
#include <dolly/runtime.h>
static volatile sig_atomic_t received;
static void on_interrupt(int number) { received = number; }
int main(int argc, char **argv) {
${Object.entries(DOLLY_ERRNO).map(([name, value]) => `  if (${name} != ${value}) return 1;`).join("\n")}
  // A packet outside the process's memory or over the limit is an errno, on
  // the hottest operation too; the process keeps running.
  static char oversized[DOLLY_PROCESS_PACKET_LIMIT + 1];
  const dolly_process_fd_io_request read_request = {0, 0, 8};
  char bytes[8];
  for (uint32_t operation = 0; operation < 256; ++operation) {
    if (operation == DOLLY_PROCESS_EXIT) continue;
    if (dolly_process_call(operation, NULL, 8, bytes, sizeof(bytes)) != -EFAULT) return 20;
    if (dolly_process_call(operation, &read_request, sizeof(read_request), NULL, 8) != -EFAULT) return 21;
    if (dolly_process_call(operation, (void *)UINT64_MAX, 8, bytes, sizeof(bytes)) != -EFAULT) return 22;
    if (dolly_process_call(operation, &read_request, UINT64_MAX, bytes, sizeof(bytes)) != -EFAULT) return 23;
    if (dolly_process_call(operation, oversized, sizeof(oversized), bytes, sizeof(bytes)) != -E2BIG) return 24;
    if (dolly_process_call(operation, &read_request, sizeof(read_request), oversized, sizeof(oversized)) != -E2BIG) return 25;
  }
  if (dolly_process_call(UINT32_MAX, NULL, 0, NULL, 0) != -ENOSYS) return 26;
  if (argc == 1) return 0;
  struct sigaction action = {.sa_handler = on_interrupt};
  if (sigaction(SIGINT, &action, NULL)) return 8;
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) return 5;
  puts("ERRNO-SLEEPING");
  fflush(stdout);
  dolly_process_clock_sleep_request request = {1, 0, (uint64_t)now.tv_sec * 1000000000 + now.tv_nsec + 60000000000};
  int64_t interrupted = dolly_process_call(DOLLY_PROCESS_CLOCK_SLEEP, &request, sizeof(request), NULL, 0);
  return interrupted == -EINTR && received == SIGINT ? 0 : 7;
}
`;
const tgz = gzipSync(tarArchive("nested/message", Buffer.from("TAR-STDIN-OK\n")));
async function handle(request, response, path, headers) {
  const body = { "/fixture/process-errors.c": errorsSource, "/fixture/input.tgz": tgz }[path];
  if (body === undefined) return false;
  response.writeHead(200, { ...headers, "content-type": "application/octet-stream" }).end(body);
  return true;
}
const prompt = /dolly:[^\n]*\$\s*$/;
// Let a probe that just printed its marker enter its sleep: a signal handled
// before the sleep starts cannot interrupt it.
const settle = () => new Promise(resolve => setTimeout(resolve, 200));

// Lifecycle, descriptors and signals, with programs compiled in the image.
await browserTest("process", { image: "system", server: { fixtures, handle } }, async ({ server, open }) => {
  const { page, submit, result, waitForText } = await open({
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const run = async command => assert.equal(await submit(command), 0, command);
  const fetchFixture = name => run(`curl -fsS ${server.origin}/fixture/${name} -o ${scratch}/${name}`);
  const interrupt = () => page.keyboard.press("Control+c");
  // Admission rejects malformed processes and DSOs before they run; an
  // executable without a table has no namespace for dso@0 to load into.
  await page.evaluate(() => import("/test/fixtures/browser-process-abi.mjs").then(module => module.runProcessAbiChecks()));
  await page.locator("#keyboard").focus();
  await run(`mkdir -p ${scratch}`);
  await fetchFixture("process-minimal.wasm");
  await run(`${scratch}/process-minimal.wasm | grep -q PROCESS-FREESTANDING-OK`);

  // A refused executable is told on its stderr which import the loader rejected.
  for (const [name, cause] of [["process-wrong-import", "env.fetch"], ["process-wrong-call", "dolly_process_0.call"]]) {
    await fetchFixture(`${name}.wasm`);
    assert.equal(await submit(`${scratch}/${name}.wasm 2> ${scratch}/refused`), 126, name);
    await run(`test $(wc -l < ${scratch}/refused) -eq 1 && grep -qF ${cause} ${scratch}/refused`);
  }

  await fetchFixture("process-errors.c");
  await run(`cc -O0 ${scratch}/process-errors.c -o ${scratch}/errors && ${scratch}/errors`);
  const cancelled = submit(`${scratch}/errors cancel`);
  await waitForText(/ERRNO-SLEEPING\s*$/);
  await settle();
  await interrupt();
  assert.equal(await cancelled, 0, "an interrupted process sleep returns EINTR after the handler runs");

  for (const name of ["process-lifecycle.c", "process-descriptors.c", "process-signals.c", "process-sigchld.c", "process-interrupt.c", "input.tgz"]) await fetchFixture(name);
  await run(`cc -O0 ${scratch}/process-lifecycle.c -o ${scratch}/lifecycle && timeout 15 ${scratch}/lifecycle`);
  await run(`cc -O0 ${scratch}/process-descriptors.c -o ${scratch}/descriptors && timeout 60 ${scratch}/descriptors`);
  await run(`cc -O0 ${scratch}/process-signals.c -o ${scratch}/signals && timeout 30 ${scratch}/signals ${scratch}`);
  await run(`cc -O0 ${scratch}/process-sigchld.c -o ${scratch}/sigchld && timeout 5 ${scratch}/sigchld`);
  await run(`gzip -dc ${scratch}/input.tgz | tar -xf - -C ${scratch} && test "$(cat ${scratch}/nested/message)" = TAR-STDIN-OK`);

  const ignored = submit(`${scratch}/signals ${scratch} ignore-loop`);
  await waitForText(/SIGNAL-IGNORE-READY\s*$/);
  await interrupt();
  await interrupt();
  assert.equal(await ignored, 99, "Ctrl-C, even pressed twice, honors SIG_IGN");
  await run(`git config --file ${scratch}/config user.email before && timeout 5 git config --file ${scratch}/config user.email after`);

  // Ctrl-C wakes each blocking call, and a program that only notes the signal
  // in its handler still shuts down when the same Ctrl-C ends its parent.
  await run(`cc -O0 ${scratch}/process-interrupt.c -o ${scratch}/interrupt`);
  const interrupted = async command => {
    const stopped = submit(command);
    await waitForText(/INTERRUPT-READY\s*$/);
    await settle();
    await interrupt();
    return stopped;
  };
  for (const wrapper of ["", "timeout 15 "]) {
    for (const blocked of ["poll", "read", "wait", "sleep"]) {
      const command = `${wrapper}${scratch}/interrupt ${blocked} ${scratch}/shut-down`;
      assert.equal(await interrupted(command), wrapper ? 130 : 0, command);
      await run(`rm ${scratch}/shut-down`);
    }
  }
  assert.equal(await interrupted(`timeout 15 ${scratch}/interrupt linger ${scratch}/shut-down`), 130);
  assert.equal(await submit(`test -f ${scratch}/shut-down`), 1, "a child still running after its grace ends with its parent");
});

// default's startup script runs $HOME/.dollyrc, then the app shell, then a
// recovery shell, all nested inside this outer shell.
await browserTest("startup script", {}, async ({ open }) => {
  const { page, submit, result, waitForText } = await open();
  const run = async command => assert.equal(await submit(command), 0, command);
  const interrupt = () => page.keyboard.press("Control+c");
  await page.locator("#keyboard").focus();
  const outer = await page.evaluate(() => __dolly.foregroundPid);
  const nextShell = previous => page.evaluate(({ source, previous }) =>
    __dolly.waitForInteractiveTerminal(new RegExp(source), "nested shell", previous), { source: prompt.source, previous });
  const type = text => page.evaluate(line => { if (!__dolly.input(line)) throw new Error("input mailbox full"); }, `${text}\r`);
  for (const [name, rc] of [
    ["failed", "exit 7"],
    ["missing", null],
    ["directory", null],
    ["cancel", "printf 'DOLLY-INIT-RC-SLEEP\\n'\nsleep 30\nprintf 'DOLLY-INIT-RC-WRONG\\n'"],
  ]) {
    const home = `${scratch}/init-${name}`;
    await run(`mkdir -p ${home}${name === "directory" ? "/.dollyrc" : ""}`);
    if (rc !== null) await run(`printf '%s\\n' ${rc.split("\n").map(shellQuote).join(" ")} > ${home}/.dollyrc`);
    await run("printf '\\033[2J\\033[H'");
    const marker = `DOLLY-INIT-OUTER-${name}`;
    await type(`HOME=${home} timeout 45 /bin/foreground -i /bin/slop /etc/dolly/init.slop; printf '\\n${marker}=%s\\n' "$?"`);
    if (name === "cancel") {
      await waitForText(/DOLLY-INIT-RC-SLEEP/);
      await settle();
      await interrupt();
    }
    const app = await nextShell(outer);
    const terminal = await page.evaluate(() => __dolly.visibleTerminalText());
    // Only a failing .dollyrc is reported; the app shell starts regardless.
    if (name === "failed") assert.match(terminal, /\.dollyrc/);
    else assert.doesNotMatch(terminal, /\.dollyrc/);
    assert.doesNotMatch(terminal, /DOLLY-INIT-RC-WRONG/);
    assert.equal(await result(() => type(`printf '%s\\n' app-${name} > "$HOME/proof"`)), 0);
    assert.equal(await nextShell(0), app);
    await page.keyboard.press("Control+d");
    const recovery = await nextShell(app);
    assert.notEqual(recovery, outer);
    assert.equal(await result(() => type(`test "$HOME" = ${home}`)), 0);
    assert.equal(await nextShell(0), recovery);
    await page.keyboard.press("Control+d");
    await page.waitForFunction(outer => __dolly.foregroundPid === outer, outer);
    await waitForText(new RegExp(`${marker}=0`));
    await run(`test "$(cat ${home}/proof)" = app-${name}`);
  }
});
