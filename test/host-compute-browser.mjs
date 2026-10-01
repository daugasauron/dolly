import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";

// Display-less embeddings. One enables only runtime@0 and gpu@0, then builds
// and runs a guest-compiled WebGPU compute program; it offers no surface. In
// another, system-build's shell ENTRY still reports the foreground command,
// which the page interrupts.
const code = await readFile(new URL("./fixtures/host-compute.c", import.meta.url), "utf8");
await browserTest("host compute", { image: "system-build" }, async ({ browser, server }) => {
  const page = await browser.newPage();
  await page.goto(server.origin + "/fixture/http.txt");
  // Boots a snapshot with these host modules and resolves to running(runtime, exited).
  await page.evaluate(() => {
    globalThis.runHeadless = async (modules, configuration, transfers, running) => {
      const { createHost } = await import("/host/modules.mjs");
      let worker;
      const host = await createHost("browser", modules, { send: message => worker.postMessage(message) });
      try {
        worker = new Worker("/src/runtime-worker.mjs", { type: "module" });
        const exited = new Promise((resolve, reject) => {
          worker.onerror = event => reject(Error(event.message));
          worker.onmessage = ({ data: message }) => {
            void host.handle(message).catch(reject);
            if (message.type === "ready") worker.postMessage({ type: "entry-ready-ack" });
            if (message.type === "exited") resolve(message.status);
            if (message.type === "error") reject(Error(message.message));
          };
        });
        worker.postMessage({ type: "configure", mode: "snapshot", ...configuration,
          hostModules: host.enabled, hostConfiguration: host.configuration }, transfers);
        return await running(host.get("runtime"), exited);
      } finally { host.dispose(); worker?.terminate(); }
    };
  });
  const result = await page.evaluate(async code => {
    const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import("/dist/dolly-images.mjs");
    const { buildImage } = await import("/src/image-builder.mjs");
    const { prepareImageArtifacts } = await import("/src/image-build.mjs");
    const { describeImageArtifact, sha256 } = await import("/src/image-artifact.mjs");
    const { consumeDollyHttpPolicy } = await import("/host/http/policy.mjs");
    const { localServicesTransport } = await import("/host/build/local-services.mjs");
    const sources = [...DOLLY_IMAGES.map(d => ({ path: `/${d.dollyfile}`, byteLength: d.byteLength })), ...DOLLY_STATIC_SOURCES];
    const network = localServicesTransport(consumeDollyHttpPolicy(globalThis, sources, new URL("/", location.href)));
    const base = DOLLY_IMAGES.find(d => d.image === "system-build");
    const recipe = `DOLLY 5\nIMAGE compute\nFROM https://daugasauron.com/Dollyfile-system-build ${base.sha256}\nREQUIRES HOST gpu@0\n` +
      `FILE /tmp/probe.c\n${code.trimEnd().split("\n").map(line => "    " + line).join("\n")}\n` +
      "SLOP cc -O1 /tmp/probe.c -ldolly-gpu -o /usr/bin/probe\nEXPORTS TOOL probe\nENTRY /usr/bin/probe\n";
    const report = () => {};
    const artifacts = await prepareImageArtifacts("custom", recipe, (name, inputs) => buildImage(name, inputs, network, report), report);
    const built = await buildImage("custom", artifacts, network, report, { customSource: recipe });
    const artifact = await describeImageArtifact(built.bytes, await sha256(new TextEncoder().encode(recipe)), built.inputs);
    const requirements = artifact.hostRequirements;
    const status = await runHeadless(["runtime@0", "gpu@0"], { image: "custom", customSource: recipe, customArtifact: artifact },
      [artifact.bytes], (_runtime, exited) => exited);
    return { status, requirements, canvases: document.querySelectorAll("canvas").length };
  }, code);
  assert.deepEqual(result, { status: 0, requirements: ["gpu@0"], canvases: 0 });
  assert.deepEqual(await page.evaluate(() => runHeadless(["runtime@0"], { image: "system-build" }, [],
    async (runtime, exited) => {
      while (!runtime.terminal?.foregroundInterruptible()) await new Promise(resolve => setTimeout(resolve, 10));
      return [runtime.terminal.interruptForeground(), await exited];
    })), [true, 130]);
});
