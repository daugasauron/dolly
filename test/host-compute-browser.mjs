import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";

// A display-less embedding that enables only runtime@0 and gpu@0 builds and
// runs a guest-compiled WebGPU compute program; it offers no surface.
const code = await readFile(new URL("./fixtures/host-compute.c", import.meta.url), "utf8");
await browserTest("host compute", { image: "system-build" }, async ({ browser, server }) => {
  const page = await browser.newPage();
  await page.goto(server.origin + "/fixture/http.txt");
  const result = await page.evaluate(async code => {
    const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import("/dist/dolly-images.mjs");
    const { createHost } = await import("/host/modules.mjs");
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
    let worker;
    const host = await createHost("browser", ["runtime@0", "gpu@0"], { send: message => worker.postMessage(message) });
    try {
      host.require(artifact.hostRequirements);
      worker = new Worker("/src/runtime-worker.mjs", { type: "module" });
      const status = await new Promise((resolve, reject) => {
        worker.onerror = event => reject(Error(event.message));
        worker.onmessage = ({ data: message }) => {
          void host.handle(message).catch(reject);
          if (message.type === "ready") worker.postMessage({ type: "entry-ready-ack" });
          if (message.type === "exited") resolve(message.status);
          if (message.type === "error") reject(Error(message.message));
        };
        worker.postMessage({ type: "configure", image: "custom", mode: "snapshot", customSource: recipe, customArtifact: artifact,
          hostModules: host.enabled, hostConfiguration: host.configuration }, [artifact.bytes]);
      });
      return { status, requirements: artifact.hostRequirements, canvases: document.querySelectorAll("canvas").length };
    } finally { host.dispose(); worker?.terminate(); }
  }, code);
  assert.deepEqual(result, { status: 0, requirements: ["gpu@0"], canvases: 0 });
});
