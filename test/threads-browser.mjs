import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";
import { DOLLY_THREADS_ABI_DIGEST } from "../host/threads/abi.mjs";

const modules = ["runtime@0", "display@0", "http@0", "download@0", "upload@0", "snapshot@0"];
// default declares threads@0 (and packages@0); system declares neither.
const enable = modules => page => page.addInitScript(modules => { globalThis.DOLLY_HOST_MODULES = modules; }, modules);
const fixtures = Object.fromEntries(["threads-pthread.c", "threads-cpp.cpp", "threads-quota.c"]
  .map(name => [name, `test/fixtures/${name}`]));
const sourceOverrides = new Map();
const probe = "/fixture/process-wrong-call.wasm";
let valid;
await browserTest("threads", { image: "default", server: { fixtures, sourceOverrides } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const { page, submit, text, waitForText } = await open({ policy, setup: enable([...modules, "packages@0", "threads@0"]) });
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  // Compilation and thread startup use retained bytes only.
  for (const [compiler, source, marker] of [["cc", "threads-pthread.c", "PTHREAD-OK"],
    ["c++", "threads-cpp.cpp", "STD-THREAD-OK"], ["cc", "threads-quota.c", "THREAD-QUOTA-OK"]]) {
    await run(`curl -fsS ${server.origin}/fixture/${source} -o /tmp/${source}`);
    const requests = [], record = request => { if (/^https?:/.test(request.url())) requests.push(request.url()); };
    page.context().on("request", record);
    await page.context().route("**/*", route => route.abort());
    try {
      await run(`${compiler} -O1 -pthread /tmp/${source} -o /tmp/${source}.wasm && /tmp/${source}.wasm`);
      assert.deepEqual(requests, [], "compilation and thread startup made HTTP requests");
    } finally {
      await page.context().unroute("**/*");
      page.context().off("request", record);
    }
    assert.ok((await text()).includes(marker), marker);
  }
  const threaded = "/tmp/threads-pthread.c.wasm";
  await run(`${threaded} --main-exit && test -f /tmp/last-thread`);
  const busy = submit(`${threaded} --busy`);
  await waitForText(/THREADS-BUSY/);
  await page.locator("#keyboard").focus();
  await page.keyboard.press("Control+c");
  assert.equal(await busy, 130);
  await run(threaded);
  assert.notEqual(await submit("cc -pthread -shared /tmp/threads-pthread.c -o /tmp/unsupported.so"), 0);
  assert.notEqual(await submit("cc -pthread -rdynamic /tmp/threads-pthread.c -o /tmp/unsupported"), 0);

  // A thread's process exit or trap ends the whole process; the shell survives.
  sourceOverrides.set(probe, "#include <pthread.h>\n#include <stdlib.h>\n" +
    "static void *body(void *exiting) { if (exiting) exit(37); __builtin_trap(); }\n" +
    "int main(int argc, char **argv) { pthread_t thread; pthread_create(&thread, 0, body, argc > 1 ? argv : 0); pthread_join(thread, 0); return 0; }\n");
  await run(`curl -fsS ${server.origin}${probe} -o /tmp/ending.c && cc -O1 -pthread /tmp/ending.c -o /tmp/ending`);
  assert.equal(await submit("/tmp/ending exit"), 37);
  assert.notEqual(await submit("/tmp/ending"), 0);
  await run("printf alive > /tmp/alive && test $(cat /tmp/alive) = alive");

  // Threads that finish while their process exits leave the exit status intact.
  sourceOverrides.set(probe, "#include <pthread.h>\n#include <stdlib.h>\n" +
    "static void *body(void *unused) { return unused; }\n" +
    "int main(void) { pthread_t thread; for (int i = 0; i < 8; ++i) pthread_create(&thread, 0, body, 0); exit(37); }\n");
  await run(`curl -fsS ${server.origin}${probe} -o /tmp/racing.c && cc -O1 -pthread /tmp/racing.c -o /tmp/racing`);
  for (let round = 0; round < 10; ++round) assert.equal(await submit("/tmp/racing"), 37, `round ${round}`);

  // Thread executables must record the threads layout and export the child entry.
  const saved = page.waitForEvent("download");
  await run(`download ${threaded}`);
  await page.click("#downloads button");
  valid = await readFile(await (await saved).path());
  const digest = Buffer.from(DOLLY_THREADS_ABI_DIGEST, "hex");
  const incompatible = Buffer.from(valid), missingEntry = Buffer.from(valid);
  incompatible[incompatible.indexOf(digest)] ^= 1;
  missingEntry[missingEntry.indexOf("dolly_thread_start")] = "_".charCodeAt(0);
  for (const bytes of [incompatible, missingEntry]) {
    sourceOverrides.set(probe, bytes);
    await run(`curl -fsS ${server.origin}${probe} -o /tmp/threads-invalid`);
    assert.equal(await submit("/tmp/threads-invalid"), 126);
  }
  assert.deepEqual(errors, []);
});

// An image that does not declare threads@0 refuses a thread executable.
await browserTest("threads refusal", { image: "system", server: { fixtures, sourceOverrides } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const denied = await open({ policy, setup: enable(modules) });
  sourceOverrides.set(probe, valid);
  assert.equal(await denied.submit(`curl -fsS ${server.origin}${probe} -o /tmp/threads-denied`), 0);
  assert.equal(await denied.submit("/tmp/threads-denied"), 126);
  assert.equal(await denied.submit("printf alive > /tmp/alive && test -f /tmp/alive"), 0);
});
