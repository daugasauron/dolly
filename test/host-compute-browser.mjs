import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";

// Display-less embeddings. One enables only runtime@0 and gpu@0, then builds
// and runs a guest-compiled WebGPU compute program; it offers no surface. In
// another, a script ENTRY still reports the foreground command, which the page
// interrupts.
const code = await readFile(new URL("./fixtures/host-compute.c", import.meta.url), "utf8");
await browserTest("host compute", { image: "system-build" }, async ({ browser, server }) => {
  const page = await browser.newPage();
  await page.goto(server.origin + "/fixture/http.txt");
  // Boots a snapshot with these host modules and resolves to running(runtime, exited).
  await page.evaluate(() => {
    // The page's own published files through the HTTP broker, as builds use them.
    globalThis.headlessNetwork = async () => {
      const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import("/dist/dolly-images.mjs");
      const { consumeDollyHttpPolicy } = await import("/host/http/policy.mjs");
      const { localServicesTransport } = await import("/host/http/local-services.mjs");
      const sources = [...DOLLY_IMAGES.map(d => ({ path: `/${d.dollyfile}`, byteLength: d.byteLength })), ...DOLLY_STATIC_SOURCES];
      const site = new URL("/", location.href);
      return { ...localServicesTransport(consumeDollyHttpPolicy(globalThis, sources, site)), site: site.href };
    };
    globalThis.runHeadless = async (modules, configuration, transfers, running) => {
      const { createHost } = await import("/host/modules.mjs");
      let worker;
      const host = await createHost("browser", modules, { send: message => worker.postMessage(message),
        configuration: { http: { network: await headlessNetwork() } } });
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
        return await running(host.kernel, exited);
      } finally { host.dispose(); worker?.terminate(); }
    };
    // Builds APPLICATION name FROM system-build (leading REQUIRES HOST rows go
    // after the role line) and resolves to its artifact and configuration.
    globalThis.buildCustom = async (name, rows) => {
      const { DOLLY_IMAGES } = await import("/dist/dolly-images.mjs");
      const { buildImage } = await import("/src/image-builder.mjs");
      const { prepareImageArtifacts } = await import("/src/image-build.mjs");
      const { describeImageArtifact, sha256 } = await import("/src/image-artifact.mjs");
      const { siteReference } = await import("/src/static-asset.mjs");
      const builders = { http: { network: await headlessNetwork() } };
      const base = DOLLY_IMAGES.find(d => d.image === "system-build");
      const hosts = rows.match(/^(?:REQUIRES HOST [^\n]*\n)*/)[0];
      const recipe = `DOLLY 7\nAPPLICATION ${name}\n${hosts}FROM ${siteReference(base.dollyfile)} ${base.sha256}\n${rows.slice(hosts.length)}`;
      const report = () => {};
      const artifacts = await prepareImageArtifacts("custom", recipe, (name, inputs) => buildImage(name, inputs, builders, report), report);
      const built = await buildImage("custom", artifacts, builders, report, { customSource: recipe });
      const artifact = await describeImageArtifact(built.bytes, await sha256(new TextEncoder().encode(recipe)), built.inputs);
      return { artifact, configuration: { image: "custom", customSource: recipe, customArtifact: artifact } };
    };
  });
  // Firefox's test build offers no adapter without a desktop: the page then
  // refuses gpu@0 before ENTRY instead of running the program.
  const adapter = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })));
  const compute = page.evaluate(async code => {
    const { artifact, configuration } = await buildCustom("compute", "REQUIRES HOST runtime@0\nREQUIRES HOST gpu@0\nREQUIRES HOST http@0\n" +
      `FILE /tmp/probe.c\n${code.trimEnd().split("\n").map(line => "    " + line).join("\n")}\n` +
      "SLOP cc -O1 /tmp/probe.c -ldolly-gpu -o /usr/bin/probe\nEXPORTS TOOL probe\nENTRY /usr/bin/probe\n");
    const status = await runHeadless(["runtime@0", "gpu@0", "http@0"], configuration, [artifact.bytes], (_runtime, exited) => exited);
    return { status, requirements: artifact.hostRequirements, canvases: document.querySelectorAll("canvas").length };
  }, code);
  if (adapter) {
    assert.deepEqual(await compute, { status: 0, requirements: ["gpu@0", "http@0", "runtime@0"], canvases: 0 });
  } else {
    await assert.rejects(compute, /Required host module gpu@0 is unavailable/);
  }
  assert.deepEqual(await page.evaluate(async () => {
    const { artifact, configuration } = await buildCustom("loop",
      "REQUIRES HOST runtime@0\nREQUIRES HOST http@0\nFILE /etc/loop.slop\n    while :; do :; done\nENTRY /bin/slop /etc/loop.slop\n");
    return runHeadless(["runtime@0", "http@0"], configuration, [artifact.bytes], async (runtime, exited) => {
      while (!runtime.terminal?.foregroundInterruptible()) await new Promise(resolve => setTimeout(resolve, 10));
      return [runtime.terminal.interruptForeground(), await exited];
    });
  }), [true, 130]);
});
