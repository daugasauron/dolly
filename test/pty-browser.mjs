import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

const fixtures = { "pty.c": "test/fixtures/pty.c", "dolly-pty.h": "host/pty/pty.h" };
const systemModules = ["runtime", "display", "input", "http", "download", "upload", "snapshot"];

// pty@0: pseudo-terminals, with a program compiled in the image
// (test/fixtures/pty.c names what each mode proves). The module ships no
// client yet, so the program makes the two calls itself.
await browserTest("pty", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const { page, submit, text } = await open({ policy, ...await composed([...systemModules, "pty"], [], { base: "system" }) });
  const status = async (command, expected = 0) => assert.equal(await submit(command), expected, `${command}\n${await text()}`);
  await status(`curl -fsS ${server.origin}/fixture/pty.c -o /tmp/pty.c && curl -fsS ${server.origin}/fixture/dolly-pty.h -o /tmp/dolly-pty.h && cc -O1 /tmp/pty.c -o /tmp/pty`);

  await status("/tmp/pty pair");
  await status("/tmp/pty program");
  await status("/tmp/pty spared");

  // One process can take every pseudo-terminal. Exit, abort (its Worker
  // fails) and forced termination of a CPU loop each give them back.
  await status("/tmp/pty quota exit");
  await status("/tmp/pty quota abort 2> /dev/null", 126);
  await status("/tmp/pty quota exit");
  await status("timeout 1 /tmp/pty quota spin", 124);
  await status("/tmp/pty quota exit");

  // The module adds no kernel import: nothing of a pseudo-terminal leaves Wasm.
  assert.equal(await page.evaluate(async () => WebAssembly.Module.imports(
    await WebAssembly.compileStreaming(fetch("/dist/dolly.wasm"))).some(entry => /pty/.test(entry.name))), false);
});
