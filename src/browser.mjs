import { buildLog } from "./build-log.mjs";
import { holdIndicators, showIndicators } from "./page-indicators.mjs";
import { hostRegistry } from "../host/modules.mjs";
import { pageChords } from "./page-chords.mjs";
import { terminalText } from "./terminal-text.mjs";
import { bootstrapSources, imageBase, imageDefinition, loadImages } from "./images.mjs";
import * as processConstants from "./process-constants.mjs";

// The terminal's own look: its canvas, the hidden keyboard, the boot log and
// the status line. A host module brings the look of what it adds; the page, the
// boot log's font (the site's is Iosevka, dist/IosevkaTerm-SemiBold.woff2).
const style = `
  .dolly-terminal { position: relative; overflow: hidden; outline: none; caret-color: transparent; }
  #display { display: block; width: 100%; height: 100%; cursor: text; touch-action: none; }
  #display[hidden] { display: none; }
  #keyboard { position: fixed; left: -10000px; top: 0; width: 1px; height: 1px; opacity: 0; caret-color: transparent; }
  #bootstrap-log { position: absolute; inset: 0; z-index: 1; margin: 0; padding: 1rem 1.15rem; overflow: auto;
    white-space: pre-wrap; color: #e8e3d7; background: #262626; font: 600 20px/1.35 "Dolly IosevkaTerm SemiBold", monospace;
    scrollbar-width: thin; scrollbar-color: #f2d45c #262626; }
  #bootstrap-log[hidden] { display: none; }
  #session-status { position: absolute; right: 1rem; top: 1rem; z-index: 5; max-width: calc(100% - 2rem);
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

// Runs an image in `mount`, an element the embedding sizes, from the image
// directory `images` (images.mjs). The embedding, trusted page code, names the
// host modules the page has (`modules`, the URLs of their manifests) and sets
// the HTTP broker's policy (`http`: { policy, relays }), both before anything
// of the guest runs. `files` ({ "/absolute/path": string or Uint8Array }) are
// written over the restored image before its ENTRY starts. `site`, given, is the
// root of the routes a module may link to (session/, sessions/, docs/). It
// resolves to the page's API (window.__dolly on the site) once the image's ENTRY runs.
export function boot(mount, { images, image, modules, site, http = {}, files = {} } = {}) {
  return run(mount, { images, modules, site, http }, async () => {
    const definition = imageDefinition(image);
    if (!definition || typeof files !== "object" || files === null) throw new Error("invalid Dolly boot options");
    if (definition.entry === null) throw new Error(`${image} has no ENTRY; it only builds`);
    return { image, label: "PRECOMPILED SYSTEM", required: definition.hostRequirements,
      start: () => ({ message: { files }, transfers: [] }) };
  });
}

// What boot() does, for the routes of the site too (site.mjs), which build and
// restore images of their own. `route(registry)` selects what runs:
// - image, label: the route's image ("custom" for none) and its boot log line;
// - required, enabled: the host modules the image requires, and those the page
//   enables (by default the required ones), which a build alone may set;
// - configuration, inherited: the modules' configuration, and what http@0
//   inherits from the tab that opened this one;
// - worker: the runtime Worker's URL, by default runtime-worker.mjs;
// - start(host, report): before the Worker starts, the fields it adds to the
//   configure message ({ message, transfers }), or null once an image without
//   ENTRY is built;
// - message(message): each message of the Worker;
// - running(host): the context host modules' entryStarted is given beside
//   `image`, and members of the page's handle.
export async function run(mount, { images, modules, site, http }, route) {
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
  const appendBootstrap = text => bootstrapOutput.append(text);
  pageChords(keyboard);
  const bootstrapDecoder = new TextDecoder();

  let runtimeWorker;
  let host;
  let rejectReady = null;
  let runtimeReady = false;
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
    notice.style.cssText = "position:absolute;left:0;right:0;bottom:0;z-index:9;padding:0.6rem 1rem;" +
      "color:#e8e3d7;background:#262626;border-top:1px solid #f2d45c;font-size:16px";
    const links = [{ text: "Reload to start again", href: location.href }, ...offers].map(({ text, href }) =>
      Object.assign(document.createElement("a"), { textContent: text, href, style: "color:#f2d45c;margin-left:1.5ch" }));
    notice.append(`This image has ended: its program ${how}.`, ...links);
    // The notice takes the element's bottom strip; the last frame and the log keep the rest.
    Object.assign(canvas.style, { height: `calc(100% - ${notice.offsetHeight}px)`, objectFit: "contain", objectPosition: "left top" });
    bootstrapLog.style.bottom = `${notice.offsetHeight}px`;
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
    await loadImages(images);
    if (!Array.isArray(modules) || !modules.length || !(site === undefined || typeof site === "string")) {
      throw new Error("invalid Dolly boot options");
    }
    const registry = await hostRegistry(modules);
    const selected = await route(registry);
    const { image } = selected;
    appendBootstrap(`DOLLY / ${image.toUpperCase()} / ${selected.label}\n\n`);
    host = await registry.createHost("browser", selected.enabled ?? selected.required, {
      send: (message, transfers = []) => runtimeWorker.postMessage(message, transfers),
      resources: { mount, canvas, keyboard, applicationBase: imageBase, site: site && new URL(site), showStatus, fatal,
        indicators: { hold: holdIndicators, show: showIndicators } },
      configuration: { ...selected.configuration, http: { ...selected.configuration?.http, embedding: http,
        sources: bootstrapSources(), inherited: selected.inherited } },
    });
    host.require(selected.required);
    const started = selected.start ? await selected.start(host, appendBootstrap) : { message: {}, transfers: [] };
    if (started === null) {
      document.documentElement.dataset.dollyStatus = "built";
      host.dispose();
      return null;
    }

    runtimeWorker = new Worker(selected.worker ?? new URL("./runtime-worker.mjs", import.meta.url), {
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
      selected.message?.(message);
      if (message.type === "bootstrap") {
        appendBootstrap(message.text);
      } else if (message.type === "bootstrap-bytes") {
        appendBootstrap(bootstrapDecoder.decode(message.bytes, { stream: true }));
      } else if (message.type === "exited") {
        ended(message);
      } else if (message.type === "error" && runtimeReady) {
        fatal(message.stack ? `${message.message}\n${message.stack}` : message.message);
      }
    });
    runtimeWorker.postMessage({
      type: "configure",
      image,
      images: imageBase.href,
      modules: registry.urls,
      hostModules: host.enabled,
      hostConfiguration: host.configuration,
      ...started.message,
    }, [...host.transfers, ...started.transfers]);

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
    document.documentElement.dataset.image = ready.image;
    const { context, page } = await selected.running?.(host) ?? {};
    await host.entryStarted({ image, ...context });
    runtimeWorker.postMessage({ type: "entry-ready-ack" });
    // A module that shows the canvas replaces the bootstrap log.
    bootstrapLog.hidden = !canvas.hidden;

    keyboard.focus({ preventScroll: true });
    document.documentElement.dataset.dollyStatus = "ready";
    showIndicators();

    return Object.create(host.page, {
      ...Object.getOwnPropertyDescriptors({ ...terminalText(host.page), get hostModules() { return host.enabled; } }),
      ...Object.getOwnPropertyDescriptors(page ?? {}),
    });
  } catch (error) {
    runtimeReady = false;
    fatal(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
