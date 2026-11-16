import assert from "node:assert/strict";
import { browserTest, composed, runSteps } from "./browser.mjs";
import pty from "./cases/pty.json" with { type: "json" };
import { siteReference } from "../page/static-asset.mjs";
import catalog from "../dist/dolly-images.json" with { type: "json" };

const fixtures = { "pty.c": "test/fixtures/pty.c" };

// pty@0: pseudo-terminals, with a program compiled in `system` with that one
// line more (test/cases/pty.json).
await browserTest("pty", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const { page, submit } = await open({ policy, ...await composed(pty.hosts, pty.packages, { base: pty.image }) });
  await runSteps(submit, server.origin, pty);

  // The module adds no kernel import: nothing of a pseudo-terminal leaves Wasm.
  assert.equal(await page.evaluate(async () => WebAssembly.Module.imports(
    await WebAssembly.compileStreaming(fetch("/dist/dolly.wasm"))).some(entry => /pty/.test(entry.name))), false);
});

// A program that does not ask gets libc's openpty and records nothing, so it
// runs in `system`. One that asked is refused there, and a recipe that keeps
// one without declaring the module does not seal.
await browserTest("pty not declared", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const { submit, text } = await open({ policy, ...await composed([], pty.packages, { base: pty.image }) });
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  await run(`curl -fsS ${server.origin}/fixture/pty.c -o /tmp/pty.c && cc -O1 /tmp/pty.c -o /tmp/unlinked && /tmp/unlinked unlinked`);
  await run("cc -O1 /tmp/pty.c -ldolly-pty -o /tmp/pty");
  assert.equal(await submit("/tmp/pty pair 2> /tmp/refused"), 126);
  await run("grep -q 'pty@0' /tmp/refused");

  const pin = name => { const { dollyfile, sha256 } = catalog.images.find(({ image }) => image === name); return `${siteReference(dollyfile)} ${sha256}`; };
  const { hostRequirements } = catalog.images.find(({ image }) => image === "system");
  const recipe = ["DOLLY 8", "APPLICATION unsealed", ...hostRequirements.map(module => `REQUIRES HOST ${module}`),
    `FROM ${pin("system")}`, `INSTALL ${pin("libdolly-pty")}`, "REQUIRES TOOL cc", "FILE /tmp/asked.c", "    #include <pty.h>",
    "    int main(void) { int master, slave; return openpty(&master, &slave, 0, 0, 0); }",
    "SLOP cc /tmp/asked.c -ldolly-pty -o /usr/bin/asked", "EXPORTS TOOL asked", "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
  await open({ prompt: null, path: "/custom/rebuild/",
    setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) })
    .then(() => assert.fail("sealed a program whose module the recipe does not declare"),
      error => assert.match(error.message, /asked.*pty@0/));
});
