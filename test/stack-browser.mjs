// Recursion deeper than a browser stack: programs stack-wrap rewrote, in
// `system` with stack@0 added, recurse further than an unwrapped one can,
// throw C++ exceptions and exit across the stacks they moved to, end with the
// reason of a trap far down, and do so in a thread too.
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

const sources = {
  // 200,000 calls: deeper than a native 8 MB stack holds frames of 48 bytes.
  "deep.c": `#include <stdio.h>
#include <stdlib.h>
static int exit_at_bottom;
__attribute__((noinline)) static unsigned long fold(unsigned long n) {
  if (n == 0) {
    if (exit_at_bottom) exit(3);
    return 0;
  }
  unsigned long below = fold(n - 1);
  return below ^ (below >> 3) ^ n;
}
int main(int argc, char **argv) {
  unsigned long n = strtoul(argv[1], NULL, 10), expected = 0;
  for (unsigned long step = 1; step <= n; ++step) expected ^= (expected >> 3) ^ step;
  exit_at_bottom = argc > 2;
  unsigned long folded = fold(n);
  printf("%lu\\n", folded);
  return folded == expected ? 0 : 1;
}
`,
  "throw.cpp": `#include <cstdio>
#include <stdexcept>
static long destroyed = 0;
struct Guard { ~Guard() { ++destroyed; } };
__attribute__((noinline)) static long dive(long n) {
  Guard guard;
  if (n == 0) throw std::runtime_error("bottom");
  return dive(n - 1) + 1;
}
int main() {
  try { dive(100000); } catch (const std::runtime_error &error) {
    std::printf("%s %ld\\n", error.what(), destroyed);
    return destroyed == 100001 ? 0 : 1;
  }
  return 2;
}
`,
  "trap.c": `__attribute__((noinline)) static int down(int n) { if (n == 0) __builtin_trap(); return down(n - 1) + 1; }
int main(void) { return down(100000); }
`,
  "thread.c": `#include <pthread.h>
#include <stdint.h>
__attribute__((noinline)) static unsigned long fold(unsigned long n) {
  if (n == 0) return 0;
  unsigned long below = fold(n - 1);
  return below ^ (below >> 3) ^ n;
}
static void *run(void *argument) { return (void *)(uintptr_t)fold((uintptr_t)argument); }
int main(void) {
  unsigned long expected = 0;
  for (unsigned long step = 1; step <= 200000; ++step) expected ^= (expected >> 3) ^ step;
  pthread_t thread;
  void *result;
  if (pthread_create(&thread, NULL, run, (void *)(uintptr_t)200000) || pthread_join(thread, &result)) return 2;
  return (uintptr_t)result == expected ? 0 : 1;
}
`,
};
function handle(request, response, path, headers) {
  const body = path.startsWith("/fixture/") ? sources[path.slice("/fixture/".length)] : undefined;
  if (body === undefined) return false;
  response.writeHead(200, { ...headers, "content-type": "text/plain" }).end(body);
  return true;
}

await browserTest("stack", { image: "system", timeout: 300_000, server: { handle } }, async ({ server, open }) => {
  const { submit, text } = await open({ policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    ...await composed(["stack"], ["stack-wrap"], { base: "system" }) });
  const run = async (command, status = 0) => assert.equal(await submit(command), status, `${command}\n${await text()}`);
  await run("mkdir /tmp/stack && cd /tmp/stack");
  for (const name of Object.keys(sources)) await run(`curl -fsS ${server.origin}/fixture/${name} -o ${name}`);

  await run("cc -O2 deep.c -o plain && stack-wrap plain -o deep");
  await run("./plain 200000", 126);
  assert.match(await text(), /process \d+ failed: (Maximum call stack size exceeded|too much recursion)/);
  await run("./deep 200000");
  await run("./deep 200000 exit", 3);
  await run("c++ -O2 throw.cpp -o plain-throw && stack-wrap plain-throw -o throw && ./throw");
  await run("cc -O2 trap.c -o plain-trap && stack-wrap plain-trap -o trap && ./trap", 126);
  assert.match(await text(), /process \d+ failed: unreachable/);
  await run("cc -O2 -pthread thread.c -o plain-thread && stack-wrap plain-thread -o thread && ./thread");

  // What it cannot rewrite it refuses.
  await run("stack-wrap deep -o twice", 1);
  assert.match(await text(), /already records stack@0/);
  await run("stack-wrap deep.c -o source", 1);
});
