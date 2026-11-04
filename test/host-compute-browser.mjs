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
      // This page is an embedding of its own: its images are the site's.
      const images = await import("/src/images.mjs");
      await images.loadImages(new URL("/", location.href));
      const { DollyHttpPolicy } = await import("/host/http/policy.mjs");
      const { localServicesTransport } = await import("/host/http/local-services.mjs");
      const site = new URL("/", location.href);
      return { ...localServicesTransport(new DollyHttpPolicy(globalThis.DOLLY_HTTP_POLICY, images.bootstrapSources(), site)),
        site: site.href };
    };
    globalThis.runHeadless = async (modules, configuration, transfers, running) => {
      // Only the modules it enables: the registry loads what the page names.
      const { hostRegistry } = await import("/host/modules.mjs");
      const registry = await hostRegistry(modules.map(value =>
        new URL(`/host/${value.split("@")[0]}/module.json`, location.href).href));
      let worker;
      const { holdIndicators, showIndicators } = await import("/src/page-indicators.mjs");
      const host = await registry.createHost("browser", modules, { send: message => worker.postMessage(message),
        resources: { applicationBase: new URL("/", location.href), indicators: { hold: holdIndicators, show: showIndicators } },
        configuration: { http: { network: await headlessNetwork() } } });
      try {
        worker = new Worker("/src/build-worker.mjs", { type: "module" });
        const exited = new Promise((resolve, reject) => {
          worker.onerror = event => reject(Error(event.message));
          worker.onmessage = ({ data: message }) => {
            void host.handle(message).catch(reject);
            if (message.type === "ready") worker.postMessage({ type: "entry-ready-ack" });
            if (message.type === "exited") resolve(message.status);
            if (message.type === "error") reject(Error(message.message));
          };
        });
        worker.postMessage({ type: "configure", mode: "snapshot", ...configuration, images: new URL("/", location.href).href,
          modules: registry.urls,
          hostModules: host.enabled, hostConfiguration: host.configuration }, transfers);
        return await running(host.kernel, exited);
      } finally { host.dispose(); worker?.terminate(); }
    };
    // Builds APPLICATION name FROM system-build with the packages installed
    // (leading REQUIRES HOST rows go after the role line) and resolves to its
    // artifact and configuration.
    globalThis.buildCustom = async (name, rows, packages = []) => {
      const { default: catalog } = await import("/dist/dolly-images.json", { with: { type: "json" } });
      const { buildImage } = await import("/src/image-builder.mjs");
      const { hostModuleUrls: modules } = await import("/host/manifests.mjs");
      const { prepareImageArtifacts } = await import("/src/image-build.mjs");
      const { siteReference } = await import("/src/static-asset.mjs");
      const builders = { http: { network: await headlessNetwork() } };
      const base = catalog.images.find(d => d.image === "system-build");
      const hosts = rows.match(/^(?:REQUIRES HOST [^\n]*\n)*/)[0];
      const installs = packages.map(image => catalog.images.find(d => d.image === image))
        .map(d => `INSTALL ${siteReference(d.dollyfile)} ${d.sha256}\n`).join("");
      const recipe = `DOLLY 7\nAPPLICATION ${name}\n${hosts}FROM ${siteReference(base.dollyfile)} ${base.sha256}\n${installs}${rows.slice(hosts.length)}`;
      const report = () => {};
      const artifacts = await prepareImageArtifacts("custom", recipe, (name, inputs) => buildImage(name, inputs, builders, report, { modules }), report);
      const artifact = await buildImage("custom", artifacts, builders, report, { modules, customSource: recipe });
      return { artifact, configuration: { image: "custom", customSource: recipe, customArtifact: artifact } };
    };
  });
  // Firefox's test build offers no adapter without a desktop: gpu@0 is there
  // all the same, and the program's first OPEN fails (it exits 1).
  const adapter = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })));
  const compute = page.evaluate(async code => {
    const { artifact, configuration } = await buildCustom("compute", "REQUIRES HOST runtime@0\nREQUIRES HOST gpu@0\nREQUIRES HOST http@0\n" +
      `FILE /tmp/probe.c\n${code.trimEnd().split("\n").map(line => "    " + line).join("\n")}\n` +
      "SLOP cc -O1 /tmp/probe.c -ldolly-gpu -o /usr/bin/probe\nEXPORTS TOOL probe\nENTRY /usr/bin/probe\n", ["libdolly-gpu"]);
    const status = await runHeadless(["runtime@0", "gpu@0", "http@0"], configuration, [], (_runtime, exited) => exited);
    return { status, requirements: artifact.hostRequirements, canvases: document.querySelectorAll("canvas").length };
  }, code);
  assert.deepEqual(await compute, { status: adapter ? 0 : 1, requirements: ["gpu@0", "http@0", "runtime@0"], canvases: 0 });
  assert.deepEqual(await page.evaluate(async () => {
    const { artifact, configuration } = await buildCustom("loop",
      "REQUIRES HOST runtime@0\nREQUIRES HOST http@0\nFILE /etc/loop.slop\n    while :; do :; done\nENTRY /bin/slop /etc/loop.slop\n");
    return runHeadless(["runtime@0", "http@0"], configuration, [], async (runtime, exited) => {
      while (!runtime.terminal?.foregroundInterruptible()) await new Promise(resolve => setTimeout(resolve, 10));
      return [await runtime.terminal.interruptForeground(), await exited];
    });
  }), [true, 130]);
});
