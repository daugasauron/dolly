import assert from "node:assert/strict";
import { browserTest, composed, runSteps } from "./browser.mjs";
import { siteReference } from "../src/static-asset.mjs";
import catalog from "../dist/dolly-images.json" with { type: "json" };
import socketCases from "./cases/sockets.json" with { type: "json" };
import undeclaredCases from "./cases/sockets-undeclared.json" with { type: "json" };

const policy = origin => ({ rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] });

// sockets@0: local stream sockets between processes (test/cases/sockets.json): the suite's
// image is `system` with the module declared and the client's package installed.
await browserTest("sockets", { image: "system", server: { fixtures: socketCases.fixtures } }, async ({ server, open }) => {
  const { page, submit } = await open({ policy: policy(server.origin),
    ...await composed(socketCases.hosts, socketCases.packages, { base: socketCases.image }) });
  await runSteps(submit, server.origin, socketCases);

  // The module adds no kernel import: http@0's dispatch stays the one network edge.
  assert.deepEqual(await page.evaluate(async () => WebAssembly.Module.imports(
    await WebAssembly.compileStreaming(fetch("/dist/dolly.wasm"))).map(entry => `${entry.module}.${entry.name}`).sort()),
  ["env.dolly_audio_dispatch", "env.dolly_bootstrap_write_bytes", "env.dolly_build_input_read", "env.dolly_clock_monotonic",
    "env.dolly_clock_realtime", "env.dolly_download_dispatch", "env.dolly_entropy", "env.dolly_gpu_dispatch", "env.dolly_html_dispatch",
    "env.dolly_http_dispatch",
    "env.dolly_memory_grow", "env.dolly_microphone_dispatch", "env.dolly_nena_dispatch", "env.memory"]);
});

// Without the module declared (test/cases/sockets-undeclared.json) a program that did not ask
// runs and one that asked is refused; a recipe that keeps one without declaring the module
// does not seal.
await browserTest("sockets not declared", { image: "system", server: { fixtures: undeclaredCases.fixtures } }, async ({ server, open }) => {
  const { submit } = await open({ policy: policy(server.origin),
    ...await composed([], undeclaredCases.packages, { base: undeclaredCases.image }) });
  await runSteps(submit, server.origin, undeclaredCases);

  const pin = name => { const { dollyfile, sha256 } = catalog.images.find(({ image }) => image === name); return `${siteReference(dollyfile)} ${sha256}`; };
  const { hostRequirements } = catalog.images.find(({ image }) => image === "system");
  const recipe = ["DOLLY 7", "APPLICATION unsealed", ...hostRequirements.map(module => `REQUIRES HOST ${module}`),
    `FROM ${pin("system")}`, `INSTALL ${pin("libdolly-sockets")}`, "REQUIRES TOOL cc", "FILE /tmp/asked.c", "    #include <sys/socket.h>",
    "    int main(void) { int ends[2]; return socketpair(AF_UNIX, SOCK_STREAM, 0, ends); }",
    "SLOP cc /tmp/asked.c -ldolly-sockets -o /usr/bin/asked", "EXPORTS TOOL asked", "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
  await open({ prompt: null, path: "/custom/rebuild/",
    setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) })
    .then(() => assert.fail("sealed a program whose module the recipe does not declare"),
      error => assert.match(error.message, /asked.*sockets@0/));
});
