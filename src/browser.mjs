import { buildLog } from "./build-log.mjs";
import { showIndicators } from "./page-indicators.mjs";
import { createHost, buildHost, selectBoot } from "../host/modules.mjs";
import { prepareImageArtifacts, loadImageHostRequirements } from "./image-build.mjs";
import { buildImage } from "./image-builder.mjs";
import { loadCustomImage, storedCustomImage } from "./custom-image.mjs";
import { describeImageArtifact, sha256 } from "./image-artifact.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";
import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";

const mount = document.querySelector("#terminal");
const canvas = document.querySelector("#display");
const keyboard = document.querySelector("#keyboard");
const bootstrapLog = document.querySelector("#bootstrap-log");
const bootstrapOutput = buildLog(bootstrapLog);
bootstrapOutput.clear();
const appendBootstrap = text => bootstrapOutput.append(text);

const encoder = new TextEncoder();
const bootstrapDecoder = new TextDecoder();

let runtimeWorker;
let host;
let rejectReady = null;
let runtimeReady = false;
let builtSystemSnapshot = null;
let builtSystemInputs = null;
let statusTimer;

// The runtime stopped: its host modules let go of the page, and the bootstrap
// log shows the reason over whatever a module drew.
function fatal(message) {
  rejectReady?.(new Error(message));
  host?.dispose();
  runtimeWorker?.terminate();
  bootstrapLog.hidden = false;
  appendBootstrap(`\nFATAL\n${message}\n`);
  document.documentElement.dataset.dollyStatus = "failed";
}

function showStatus(message, persistent = false) {
  const status = document.querySelector("#session-status");
  clearTimeout(statusTimer);
  status.textContent = message;
  status.hidden = false;
  if (!persistent) statusTimer = setTimeout(() => { status.hidden = true; }, 6000);
}

async function boot() {
  document.documentElement.dataset.dollyStatus = "loading";
  const configured = globalThis.DOLLY_BOOT;
  const packagedImages = new Set(DOLLY_IMAGES.map(({ image }) => image));
  if (configured === null || typeof configured !== "object" ||
      !(packagedImages.has(configured.image) || configured.image === "custom") ||
      !["snapshot", "rebuild"].includes(configured.mode) ||
      typeof configured.loadSession !== "boolean") {
    throw new Error("invalid Dolly route configuration");
  }
  const bootMode = configured.mode;
  // A module may select what boots: a saved session names its image, its
  // module and the custom image record it was saved from.
  const selected = await selectBoot(configured);
  const image = selected?.image ?? configured.image;
  // The custom image this tab runs: its Dollyfile and, in snapshot mode, the
  // completed artifact and what the tab inherits from the page that built it.
  const custom = image === "custom" ? selected?.custom ?? storedCustomImage() : undefined;
  if (image === "custom" && !custom) {
    throw new Error("No uploaded Dollyfile is available in this tab. Return to the Dolly menu.");
  }
  const customSource = custom?.source;
  const applicationBase = new URL("../", import.meta.url);
  const bootstrapSources = [
    ...DOLLY_IMAGES.map((definition) => ({
      path: `/${definition.dollyfile}`,
      byteLength: definition.byteLength,
    })),
    ...DOLLY_STATIC_SOURCES,
  ];
  const requiredHost = [...await loadImageHostRequirements(image, customSource), ...selected ? [selected.module] : []];
  appendBootstrap(`DOLLY / ${image.toUpperCase()} / ${selected?.label ?? (bootMode === "rebuild"
    ? "REBUILD FROM SOURCE" : "PRECOMPILED SYSTEM")}\n\n`);
  const recipe = customSource === undefined ? DOLLY_IMAGES.find(definition => definition.image === image)
    : inspectDollyfile(customSource);
  const runnable = recipe.entry !== null;
  host = await createHost("browser", !runnable ? buildHost : globalThis.DOLLY_HOST_MODULES ??
    [...requiredHost, ...(bootMode === "rebuild" ? buildHost : [])], {
    send: (message, transfers = []) => runtimeWorker.postMessage(message, transfers),
    resources: { mount, canvas, keyboard, applicationBase, showStatus, fatal, bootstrapSources,
      inherited: bootMode === "snapshot" ? custom : undefined },
    configuration: selected?.configuration ?? {},
  });
  delete globalThis.DOLLY_HOST_MODULES;
  const buildDependency = (name, inputs) => buildImage(name, inputs, host.builder, appendBootstrap);
  const prepareArtifacts = () => prepareImageArtifacts(image, customSource, buildDependency,
    text => appendBootstrap(`${text}\n`));
  if (bootMode === "rebuild" && !runnable) {
    // An image without ENTRY has no program to run: keep the complete log and report the result.
    const artifacts = await prepareArtifacts();
    const built = await buildImage(image, artifacts, host.builder, appendBootstrap, { customSource });
    const name = customSource === undefined ? image : recipe.image;
    appendBootstrap(`\nBUILT ${name} · ${(built.byteLength / 1024 / 1024).toFixed(1)} MiB · sha256 ${built.sha256}\n`);
    document.documentElement.dataset.dollyStatus = "built";
    host.dispose();
    return;
  }
  if (!runnable) throw new Error(`${image} has no ENTRY; it only builds`);
  host.require(requiredHost);
  const customArtifact = image === "custom" && bootMode === "snapshot"
    ? await loadCustomImage(customSource, custom.artifact) : undefined;
  const artifacts = bootMode === "rebuild" ? await prepareArtifacts() : [];

  const workerUrl = new URL("./runtime-worker.mjs", import.meta.url);
  runtimeWorker = new Worker(workerUrl, {
    type: "module",
    name: "dolly-runtime",
  });
  runtimeWorker.addEventListener("error", () => host.dispose());
  runtimeWorker.addEventListener("message", (event) => {
    const message = event.data;
    void host.handle(message).catch(error => fatal(error.message));
    if (message.type === "bootstrap") {
      appendBootstrap(message.text);
    } else if (message.type === "bootstrap-bytes") {
      appendBootstrap(bootstrapDecoder.decode(message.bytes, { stream: true }));
    } else if (message.type === "system-snapshot") {
      builtSystemSnapshot = message.bytes;
      builtSystemInputs = message.inputs;
    } else if (message.type === "exited") {
      host.dispose();
      runtimeWorker.terminate();
      document.documentElement.dataset.dollyStatus = "exited";
    } else if (message.type === "error" && runtimeReady) {
      fatal(message.stack ? `${message.message}\n${message.stack}` : message.message);
    }
  });
  const workerConfiguration = {
    type: "configure",
    image,
    mode: bootMode,
    hostModules: host.enabled,
    hostConfiguration: host.configuration,
    artifacts,
    ...(customSource === undefined ? {} : { customSource }),
    ...(customArtifact === undefined ? {} : { customArtifact }),
  };
  runtimeWorker.postMessage(
    workerConfiguration,
    [...host.transfers, ...artifacts.map(artifact => artifact.bytes),
      ...(customArtifact === undefined ? [] : [customArtifact.bytes])],
  );

  const ready = await new Promise((resolve, reject) => {
    rejectReady = reject;
    runtimeWorker.addEventListener("message", function onMessage(event) {
      if (event.data.type === "ready") {
        runtimeWorker.removeEventListener("message", onMessage);
        resolve(event.data);
      } else if (event.data.type === "error") {
        runtimeWorker.removeEventListener("message", onMessage);
        const error = new Error(event.data.message);
        if (event.data.stack) error.stack = event.data.stack;
        reject(error);
      }
    });
    runtimeWorker.addEventListener("error", reject, { once: true });
  }).finally(() => { rejectReady = null; });
  appendBootstrap(bootstrapDecoder.decode());
  runtimeReady = true;
  if (ready.bootMode !== bootMode) throw new Error("runtime boot mode mismatch");
  if (ready.routeImage !== image || (image !== "custom" && ready.image !== image)) {
    throw new Error("runtime image mismatch");
  }
  document.documentElement.dataset.image = ready.image;
  document.documentElement.dataset.bootMode = ready.bootMode;
  document.documentElement.dataset.snapshotBytes = String(ready.snapshotBytes);
  let running;
  if (image === "custom") {
    const artifact = customArtifact ?? await describeImageArtifact(builtSystemSnapshot,
      await sha256(encoder.encode(customSource)), builtSystemInputs);
    const { buildId, recipeSha256, sha256: digest, byteLength, inputs } = artifact;
    running = { source: customSource, artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs },
      ...host.inherited };
  }
  await host.entryStarted({ image, custom: running, systemSnapshot: builtSystemSnapshot });
  runtimeWorker.postMessage({ type: "entry-ready-ack" });
  // A module that shows the canvas replaces the bootstrap log.
  bootstrapLog.hidden = !canvas.hidden;

  keyboard.focus({ preventScroll: true });
  document.documentElement.dataset.dollyStatus = "ready";
  showIndicators();

  window.__dolly = Object.create(host.page, Object.getOwnPropertyDescriptors({
    hostModules: host.enabled,
    get systemSnapshot() { return builtSystemSnapshot; },
    get systemInputs() { return builtSystemInputs; },
  }));
}

boot().catch((error) => {
  console.error(error);
  runtimeReady = false;
  fatal(error instanceof Error ? error.message : String(error));
});

window.addEventListener("pagehide", () => { host?.dispose(); runtimeWorker?.terminate(); });
