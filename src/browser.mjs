import { buildLog } from "./build-log.mjs";
import { holdIndicators, showIndicators } from "./page-indicators.mjs";
import { hostRegistry, buildHost } from "../host/modules.mjs";
import { prepareImageArtifacts, loadImageHostRequirements } from "./image-build.mjs";
import { buildImage } from "./image-builder.mjs";
import { loadCustomImage, storedCustomImage } from "./custom-image.mjs";
import { describeImageArtifact, sha256 } from "./image-artifact.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";
import { pageChords } from "./page-chords.mjs";
import { terminalText } from "./terminal-text.mjs";
import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";
import * as processConstants from "./process-constants.mjs";

const encoder = new TextEncoder();

// The terminal's own look: its canvas, the hidden keyboard, the boot log and
// the status line. A host module brings the look of what it adds.
const style = `
  @font-face { font-family: "Dolly IosevkaTerm SemiBold"; font-style: normal; font-weight: 600; font-display: block;
    src: url("${new URL("../dist/IosevkaTerm-SemiBold.woff2", import.meta.url)}") format("woff2"); }
  .dolly-terminal { position: relative; overflow: hidden; outline: none; caret-color: transparent; }
  #display { display: block; width: 100%; height: 100%; cursor: text; touch-action: none; }
  #display[hidden] { display: none; }
  #keyboard { position: fixed; left: -10000px; top: 0; width: 1px; height: 1px; opacity: 0; caret-color: transparent; }
  #bootstrap-log { position: absolute; inset: 0; z-index: 1; margin: 0; padding: 1rem 1.15rem; overflow: auto;
    white-space: pre-wrap; color: #e8e3d7; background: #262626; font: 600 20px/1.35 "Dolly IosevkaTerm SemiBold", monospace;
    scrollbar-width: thin; scrollbar-color: #f2d45c #262626; }
  #bootstrap-log[hidden] { display: none; }
  #session-status { position: fixed; right: 1rem; top: 1rem; z-index: 5; max-width: calc(100vw - 2rem);
    padding: 0.5rem 0.75rem; color: #e8e3d7; background: #262626; border: 1px solid #77736c; font-size: 14px; }
  #session-status[hidden] { display: none; }
  html[data-indicators="hidden"] .page-indicator { display: none; }
  @media (max-width: 640px) { #bootstrap-log { padding: 0.65rem 0.75rem; } }
`;

function element(tag, properties, attributes = {}) {
  const node = Object.assign(document.createElement(tag), properties);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

// Runs an image in `mount`, an element the embedding sizes. The embedding,
// trusted page code, names the host modules the page has (`modules`, the URLs
// of their manifests), may close the set an image can use (`hostModules`) and
// sets the HTTP broker's policy (`http`: { policy, relays }), all before
// anything of the guest runs. `image` is a packaged image or "custom", `mode`
// "snapshot" or "rebuild", and `loadSession` asks the snapshot module for the
// session the route names. It resolves to the page's API (window.__dolly on the
// site) once the image's ENTRY runs, or to null when it only built an image.
export async function boot(mount, { image: route, mode = "snapshot", loadSession = false, modules, hostModules, http = {} } = {}) {
  if (!document.querySelector("style[data-dolly]")) {
    document.head.append(element("style", { textContent: style }, { "data-dolly": "" }));
  }
  const canvas = element("canvas", { id: "display", hidden: true }, { "aria-label": "Dolly sandbox framebuffer" });
  const keyboard = element("textarea", { id: "keyboard" }, { "aria-label": "Dolly keyboard input",
    autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  const bootstrapLog = element("pre", { id: "bootstrap-log" }, { "aria-live": "polite" });
  const status = element("div", { id: "session-status", hidden: true }, { role: "status" });
  mount.classList.add("dolly-terminal");
  mount.replaceChildren(canvas, keyboard, bootstrapLog, status);
  const bootstrapOutput = buildLog(bootstrapLog);
  bootstrapOutput.clear();
  const appendBootstrap = text => bootstrapOutput.append(text);
  pageChords(keyboard);
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

  // The image is over when its ENTRY process is. The page says how in its own
  // text below the display, which keeps the last frame and gives up that strip:
  // a program can draw a lookalike while it runs, but nothing of the guest can
  // cover, change or remove this notice. A module may offer a link beside
  // "start again".
  function ended({ status: code, signal, failure }) {
    const offers = host.ended();
    host.dispose();
    runtimeWorker.terminate();
    const signalName = Object.keys(processConstants).find(name =>
      /^DOLLY_PROCESS_SIG(?!NAL)/.test(name) && processConstants[name] === signal)?.slice("DOLLY_PROCESS_".length);
    const how = failure ? `failed: ${failure}` : signal ? `was ended by ${signalName ?? `signal ${signal}`}`
      : `exited with status ${code}`;
    const notice = mount.appendChild(element("div", { id: "image-ended" }, { role: "alert" }));
    notice.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9;padding:0.6rem 1rem;" +
      "color:#e8e3d7;background:#262626;border-top:1px solid #f2d45c;font-size:16px";
    const links = [{ text: "Reload to start again", href: location.href }, ...offers].map(({ text, href }) =>
      Object.assign(document.createElement("a"), { textContent: text, href, style: "color:#f2d45c;margin-left:1.5ch" }));
    notice.append(`This image has ended: its program ${how}.`, ...links);
    mount.style.height = `calc(100% - ${notice.offsetHeight}px)`;
    Object.assign(canvas.style, { objectFit: "contain", objectPosition: "left top" });
    links[0].focus();
    document.documentElement.dataset.dollyStatus = "exited";
  }

  function showStatus(message, persistent = false) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = false;
    if (!persistent) statusTimer = setTimeout(() => { status.hidden = true; }, 6000);
  }

  addEventListener("pagehide", () => { host?.dispose(); runtimeWorker?.terminate(); });
  try {
    document.documentElement.dataset.dollyStatus = "loading";
    const packagedImages = new Set(DOLLY_IMAGES.map(({ image }) => image));
    if (!(packagedImages.has(route) || route === "custom") || !["snapshot", "rebuild"].includes(mode) ||
        typeof loadSession !== "boolean" || !Array.isArray(modules) || !modules.length ||
        (hostModules !== undefined && !Array.isArray(hostModules))) {
      throw new Error("invalid Dolly boot options");
    }
    const bootMode = mode;
    // A module may select what boots: a saved session names its image, its
    // module and the custom image record it was saved from.
    const registry = await hostRegistry(modules);
    const selected = await registry.selectBoot({ image: route, mode, loadSession });
    const image = selected?.image ?? route;
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
    host = await registry.createHost("browser", !runnable ? registry.buildHostFor(requiredHost) : hostModules ??
      [...requiredHost, ...(bootMode === "rebuild" ? buildHost : [])], {
      send: (message, transfers = []) => runtimeWorker.postMessage(message, transfers),
      resources: { mount, canvas, keyboard, applicationBase, showStatus, fatal, bootstrapSources,
        indicators: { hold: holdIndicators, show: showIndicators },
        inherited: bootMode === "snapshot" ? custom : undefined },
      configuration: { ...selected?.configuration, http: { ...selected?.configuration?.http, embedding: http } },
      closed: hostModules !== undefined,
    });
    const buildDependency = (name, inputs) => buildImage(name, inputs, host.builder, appendBootstrap);
    const prepareArtifacts = () => prepareImageArtifacts(image, customSource, buildDependency,
      text => appendBootstrap(`${text}\n`));
    if (bootMode === "rebuild" && !runnable) {
      // An image without ENTRY has no program to run: keep the complete log and report the result.
      const artifacts = await prepareArtifacts();
      const built = await buildImage(image, artifacts, host.builder, appendBootstrap, { customSource, consume: true });
      const name = customSource === undefined ? image : recipe.image;
      appendBootstrap(`\nBUILT ${name} · ${(built.byteLength / 1024 / 1024).toFixed(1)} MiB · sha256 ${built.sha256}\n`);
      document.documentElement.dataset.dollyStatus = "built";
      host.dispose();
      return null;
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
    // An uncaught failure in the Worker, a kernel trap outside a system call
    // among them, is the runtime's end: the page says so.
    runtimeWorker.addEventListener("error", event => {
      const message = event.message || "the runtime Worker failed";
      if (rejectReady) rejectReady(new Error(message)); else fatal(message);
    });
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
        ended(message);
      } else if (message.type === "error" && runtimeReady) {
        fatal(message.stack ? `${message.message}\n${message.stack}` : message.message);
      }
    });
    const workerConfiguration = {
      type: "configure",
      image,
      mode: bootMode,
      modules: registry.urls,
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
    }).finally(() => { rejectReady = null; });
    appendBootstrap(bootstrapDecoder.decode());
    runtimeReady = true;
    if (ready.bootMode !== bootMode) throw new Error("runtime boot mode mismatch");
    if (ready.routeImage !== image || (image !== "custom" && ready.image !== image)) {
      throw new Error("runtime image mismatch");
    }
    document.documentElement.dataset.image = ready.image;
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

    return Object.create(host.page, Object.getOwnPropertyDescriptors({
      ...terminalText(host.page),
      get hostModules() { return host.enabled; },
      get systemSnapshot() { return builtSystemSnapshot; },
    }));
  } catch (error) {
    runtimeReady = false;
    fatal(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
