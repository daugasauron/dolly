import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";
import { siteReference } from "../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";

const fixtures = { "pty.c": "test/fixtures/pty.c" };
const systemModules = ["runtime", "display", "input", "http", "download", "upload", "snapshot"];

// pty@0: pseudo-terminals, with a program compiled in the image
// (test/fixtures/pty.c names what each mode proves). A program asks for
// openpty when it links, -ldolly-pty, and then records the module: the
// suite's image is `system` with that one line more.
await browserTest("pty", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const { page, submit, text } = await open({ policy, ...await composed([...systemModules, "pty"], [], { base: "system" }) });
  const status = async (command, expected = 0) => assert.equal(await submit(command), expected, `${command}\n${await text()}`);
  await status(`curl -fsS ${server.origin}/fixture/pty.c -o /tmp/pty.c && cc -O1 /tmp/pty.c -ldolly-pty -o /tmp/pty`);

  await status("/tmp/pty pair");
  await status("/tmp/pty libc");
  await status("/tmp/pty program");
  await status("/tmp/pty spared");
  await status("/tmp/pty deaf");
  await status("/tmp/pty flow");

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

// A program that does not ask gets libc's openpty and records nothing, so it
// runs in `system`. One that asked is refused there, and a recipe that keeps
// one without declaring the module does not seal.
await browserTest("pty not declared", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const { submit, text } = await open({ policy });
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  await run(`curl -fsS ${server.origin}/fixture/pty.c -o /tmp/pty.c && cc -O1 /tmp/pty.c -o /tmp/unlinked && /tmp/unlinked unlinked`);
  await run("cc -O1 /tmp/pty.c -ldolly-pty -o /tmp/pty");
  assert.equal(await submit("/tmp/pty pair 2> /tmp/refused"), 126);
  await run("grep -q 'pty@0' /tmp/refused");

  const { dollyfile, sha256 } = DOLLY_IMAGES.find(({ image }) => image === "system");
  const recipe = ["DOLLY 7", "APPLICATION unsealed", ...systemModules.map(module => `REQUIRES HOST ${module}@0`),
    `FROM ${siteReference(dollyfile)} ${sha256}`, "REQUIRES TOOL cc", "FILE /tmp/asked.c", "    #include <pty.h>",
    "    int main(void) { int master, slave; return openpty(&master, &slave, 0, 0, 0); }",
    "SLOP cc /tmp/asked.c -ldolly-pty -o /usr/bin/asked", "EXPORTS TOOL asked", "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
  await open({ prompt: null, path: "/custom/rebuild/",
    setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) })
    .then(() => assert.fail("sealed a program whose module the recipe does not declare"),
      error => assert.match(error.message, /asked.*pty@0/));
});
