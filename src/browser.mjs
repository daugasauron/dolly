import { buildLog } from "./build-log.mjs";
import { createHost, buildHost } from "../host/modules.mjs";
import { DisplayTransport } from "../host/display/display.mjs";
import { prepareImageArtifacts, loadImageHostRequirements } from "./image-build.mjs";
import { buildImage } from "./image-builder.mjs";
import { loadCustomImage } from "./custom-image.mjs";
import { describeImageArtifact, sha256 } from "./image-artifact.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";
import { consumeDollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "../host/http/policy.mjs";
import { localServicesTransport } from "../host/build/local-services.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION,
  decodeSessionSnapshot,
  loadStoredSession,
  sessionImageIdentity,
  customSessionIdentity,
  sessionCompatible,
  validSessionName,
} from "./session-store.mjs";
import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
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
const runtimeFailureRejectors = new Set();

let runtimeWorker;
let host;
let transport;
let networkTransport;
let runtimeReady = false;
let builtSystemSnapshot = null;
let builtSystemInputs = null;
let statusTimer;

function displayFatal(message) {
  for (const reject of runtimeFailureRejectors) reject(new Error(message));
  runtimeFailureRejectors.clear();
  host?.dispose();
  runtimeWorker?.terminate();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  canvas.hidden = true;
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

async function submitInput(command, input = `${command}\r`) {
  const sequence = transport.currentResultSequence();
  if (!transport.pushText(input)) throw new Error("Dolly input mailbox is full");
  let rejectRuntimeFailure;
  const runtimeFailure = new Promise((_resolve, reject) => {
    rejectRuntimeFailure = reject;
    runtimeFailureRejectors.add(reject);
  });
  const commandStatus = await Promise.race([
    transport.waitForResult(sequence),
    runtimeFailure,
  ]).finally(() => runtimeFailureRejectors.delete(rejectRuntimeFailure));
  return commandStatus;
}

async function waitFor(predicate, description, attempts = 500) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function visibleTerminalText() {
  const geometry = transport.geometry();
  const dimensions = transport.dimensions();
  if (!geometry.cellWidth || !geometry.cellHeight ||
      !dimensions.cols || !dimensions.rows) return "";
  const x = geometry.paddingX + Math.floor(geometry.cellWidth / 4);
  const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
  const sequence = Atomics.load(transport.words,
    transport.word + DisplayTransport.copySequence);
  transport.pushPointer(x, y, 1, {});
  transport.pushPointer(x + (dimensions.cols - 1) * geometry.cellWidth,
    y + (dimensions.rows - 1) * geometry.cellHeight, 2, {});
  transport.pushPointer(x + (dimensions.cols - 1) * geometry.cellWidth,
    y + (dimensions.rows - 1) * geometry.cellHeight, 0, {});
  await waitFor(() => Atomics.load(transport.words,
    transport.word + DisplayTransport.copySequence) !== sequence,
  "terminal selection publication");
  return transport.copySelection() ?? "";
}

async function waitForInteractiveTerminal(pattern, description, previousPid = 0) {
  let pid;
  await waitFor(async () => {
    pid = transport.foregroundPid();
    if (pid <= 0 || pid === previousPid || transport.foregroundInterruptible() ||
        transport.graphicsActive() || !transport.inputIdle()) return false;
    const text = await visibleTerminalText();
    return transport.foregroundPid() === pid &&
      !transport.foregroundInterruptible() && pattern.test(text);
  }, description, 6000);
  const geometry = transport.geometry();
  const x = geometry.paddingX + Math.floor(geometry.cellWidth / 2);
  const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
  transport.pushPointer(x, y, 1, {});
  transport.pushPointer(x, y, 0, {});
  await waitFor(() => transport.inputIdle(), "terminal selection cleanup");
  return pid;
}

async function boot() {
  document.documentElement.dataset.dollyStatus = "loading";
  const configured = globalThis.DOLLY_BOOT;
  const packagedImages = new Set(DOLLY_IMAGES.map(({ image }) => image));
  if (configured === null || typeof configured !== "object" ||
      !(packagedImages.has(configured.image) || configured.image === "custom") ||
      !["snapshot", "rebuild"].includes(configured.mode) ||
      typeof configured.loadSession !== "boolean" ||
      (configured.loadSession && configured.mode !== "snapshot")) {
    throw new Error("invalid Dolly route configuration");
  }
  const bootMode = configured.mode;
  let image = configured.image;
  const recovering = configured.loadSession && new URL(location.href).searchParams.get("recover") === "1";
  let restoredSession = null;
  let sessionSnapshot;
  if (configured.loadSession) {
    const name = decodeURIComponent(location.pathname.replace(/\/+$/, "").split("/").at(-1));
    if (!validSessionName(name)) throw new Error("The Dolly session URL has an invalid name");
    restoredSession = await loadStoredSession(name);
    if (restoredSession === null) throw new Error(`Session '${name}' was not found in this browser. Open /session to see saved sessions.`);
    if (restoredSession.name !== name) throw new Error("Stored session name does not match its key");
    if (recovering) {
      if (restoredSession.formatVersion !== DOLLY_SESSION_FORMAT_VERSION) throw new Error("This save uses an unsupported recovery format");
      if (!packagedImages.has("system")) throw new Error("File recovery needs the system image in this distribution");
      image = "system";
    } else if (!sessionCompatible(restoredSession, DOLLY_IMAGES, DOLLY_BUILD_ID, DOLLY_IMAGE_BUILD_ID)) {
      throw new Error("This save belongs to an older runtime or image recipe. It has not been deleted or overwritten. Open /session to see saved sessions.");
    }
    if (!recovering) image = restoredSession.image;
    sessionSnapshot = await decodeSessionSnapshot(restoredSession);
    restoredSession.bytes.transfer(0);
    restoredSession.bytes = undefined;
  }
  const applicationBase = new URL("../", import.meta.url);
  const trustedBootstrapSources = [
    ...DOLLY_IMAGES.map((definition) => ({
      path: `/${definition.dollyfile}`,
      byteLength: definition.byteLength,
    })),
    ...DOLLY_STATIC_SOURCES,
  ];
  let httpPolicy = consumeDollyHttpPolicy(
    window,
    trustedBootstrapSources,
    applicationBase,
  );
  if (image === "custom" && bootMode === "snapshot") {
    httpPolicy = restrictDollyHttpPolicy(httpPolicy, restoredSession?.customImage.policies ??
      JSON.parse(sessionStorage.getItem("dolly-custom-policy")),
      trustedBootstrapSources, applicationBase);
  }
  // Builders and the page's own rebuild never reach local services. An enabled
  // build@0 adds the build service to localServices once the image ENTRY starts.
  const buildNetwork = localServicesTransport(httpPolicy);
  const localServices = {};
  const customSource = image === "custom"
    ? restoredSession?.customImage.source ?? sessionStorage.getItem("dolly-custom-source")
    : undefined;
  if (image === "custom" && !customSource) {
    throw new Error("No uploaded Dollyfile is available in this tab. Return to the Dolly menu.");
  }
  const requiredHost = [...await loadImageHostRequirements(image, customSource)];
  if (sessionSnapshot !== undefined) requiredHost.push("snapshot@0");
  appendBootstrap(`DOLLY / ${image.toUpperCase()} / ${restoredSession
    ? `${recovering ? "RECOVER FILES FROM" : "RESTORE SESSION"} ${restoredSession.name}`
    : bootMode === "rebuild"
    ? "REBUILD FROM SOURCE"
    : "PRECOMPILED SYSTEM"}\n\n`);
  const buildDependency = (name, inputs) => buildImage(name, inputs, buildNetwork, appendBootstrap);
  const prepareArtifacts = () => prepareImageArtifacts(image, customSource, buildDependency,
    text => appendBootstrap(`${text}\n`));
  if (bootMode === "rebuild" && !requiredHost.includes("display@0")) {
    // Build images have no terminal: keep the complete log and report the result.
    const artifacts = await prepareArtifacts();
    const built = await buildImage(image, artifacts, buildNetwork, appendBootstrap, { customSource });
    const name = customSource === undefined ? image : inspectDollyfile(customSource).image;
    appendBootstrap(`\nBUILT ${name} · ${(built.byteLength / 1024 / 1024).toFixed(1)} MiB · sha256 ${built.sha256}\n`);
    document.documentElement.dataset.dollyStatus = "built";
    return;
  }
  host = await createHost("browser", globalThis.DOLLY_HOST_MODULES ??
    [...requiredHost, ...(bootMode === "rebuild" ? buildHost : [])], {
    send: (message, transfers = []) => runtimeWorker.postMessage(message, transfers),
    resources: { mount, canvas, keyboard, applicationBase, showStatus, fatal: displayFatal },
    configuration: {
      http: { network: localServicesTransport(httpPolicy, localServices) },
      build: { network: buildNetwork, policies: httpPolicyConfigurations(httpPolicy), services: localServices },
    },
  });
  delete globalThis.DOLLY_HOST_MODULES;
  host.require(requiredHost);
  const customArtifact = image === "custom" && bootMode === "snapshot"
    ? await loadCustomImage(customSource, restoredSession?.customImage.artifact ??
      JSON.parse(sessionStorage.getItem("dolly-custom-artifact"))) : undefined;
  const artifacts = bootMode === "rebuild" ? await prepareArtifacts() : [];

  const workerUrl = new URL("./runtime-worker.mjs", import.meta.url);
  runtimeWorker = new Worker(workerUrl, {
    type: "module",
    name: "dolly-runtime",
  });
  runtimeWorker.addEventListener("error", () => host.dispose());
  runtimeWorker.addEventListener("message", (event) => {
    const message = event.data;
    void host.handle(message).catch(error => displayFatal(error.message));
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
      displayFatal(message.stack ? `${message.message}\n${message.stack}` : message.message);
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
    ...(sessionSnapshot === undefined ? {} : { sessionSnapshot }),
    ...(recovering ? { recoverSession: restoredSession.name } : {}),
  };
  runtimeWorker.postMessage(
    workerConfiguration,
    [...host.transfers, ...artifacts.map(artifact => artifact.bytes), ...(sessionSnapshot === undefined ? [] : [sessionSnapshot]),
      ...(customArtifact === undefined ? [] : [customArtifact.bytes])],
  );

  const ready = await new Promise((resolve, reject) => {
    runtimeFailureRejectors.add(reject);
    runtimeWorker.addEventListener("message", function onMessage(event) {
      if (event.data.type === "ready") {
        runtimeFailureRejectors.delete(reject);
        runtimeWorker.removeEventListener("message", onMessage);
        resolve(event.data);
      } else if (event.data.type === "error") {
        runtimeFailureRejectors.delete(reject);
        runtimeWorker.removeEventListener("message", onMessage);
        const error = new Error(event.data.message);
        if (event.data.stack) error.stack = event.data.stack;
        reject(error);
      }
    });
    runtimeWorker.addEventListener("error", reject, { once: true });
  });
  appendBootstrap(bootstrapDecoder.decode());
  runtimeReady = true;
  if (ready.bootMode !== bootMode) throw new Error("runtime boot mode mismatch");
  if (ready.routeImage !== image || (image !== "custom" && ready.image !== image)) {
    throw new Error("runtime image mismatch");
  }
  document.documentElement.dataset.image = ready.image;
  document.documentElement.dataset.bootMode = ready.bootMode;
  document.documentElement.dataset.snapshotBytes = String(ready.snapshotBytes);
  transport = host.get("display")?.transport;
  networkTransport = host.get("http")?.transport;
  let custom;
  if (image === "custom") {
    const artifact = customArtifact ?? await describeImageArtifact(builtSystemSnapshot,
      await sha256(encoder.encode(customSource)), builtSystemInputs);
    const { buildId, recipeSha256, sha256: digest, byteLength, inputs } = artifact;
    custom = { source: customSource,
      artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs },
      policies: httpPolicyConfigurations(httpPolicy) };
  }
  await host.entryStarted({ image, custom, systemSnapshot: builtSystemSnapshot,
    identity: custom ? customSessionIdentity(custom) : sessionImageIdentity(DOLLY_IMAGES, image),
    restored: restoredSession && { name: restoredSession.name, recovering } });
  runtimeWorker.postMessage({ type: "entry-ready-ack" });
  // A module that shows the canvas replaces the bootstrap log.
  bootstrapLog.hidden = !canvas.hidden;
  document.documentElement.dataset.terminal = "ghostty-rgba-wasm";

  keyboard.focus({ preventScroll: true });
  document.documentElement.dataset.dollyStatus = "ready";

  window.__dolly = {
    get gpu() { return host.get("gpu")?.status ?? {}; },
    get audio() { return host.get("audio")?.status; },
    hostModules: host.enabled,
    display: host.get("display")?.presenter,
    transport,
    get foregroundPid() {
      return transport.foregroundPid();
    },
    get graphicsActive() {
      return transport.graphicsActive();
    },
    get httpActive() {
      return networkTransport?.active ?? false;
    },
    get httpRequestCount() {
      return networkTransport?.requestCount ?? 0;
    },
    get httpCompletedRequestCount() {
      return networkTransport?.completedRequestCount ?? 0;
    },
    get systemSnapshot() {
      return builtSystemSnapshot;
    },
    get systemInputs() {
      return builtSystemInputs;
    },
    get sessionName() {
      return host.get("snapshot")?.name ?? null;
    },
    saveSession(name) {
      return host.get("snapshot")?.save(name) ?? Promise.reject(new Error("Dolly is not ready to save a session"));
    },
    submit(command) {
      return submitInput(command);
    },
    input(data) {
      return transport.pushText(data);
    },
    paste(data) {
      return transport.pushPaste(data);
    },
    copySelection() {
      return transport.copySelection();
    },
    visibleTerminalText,
    waitForInteractiveTerminal,
    key(key, code, modifiers = 0) {
      return transport.pushSyntheticKey(key, code, modifiers);
    },
    get fontSize() {
      return transport.fontSize();
    },
  };
}

boot().catch((error) => {
  console.error(error);
  runtimeReady = false;
  displayFatal(error instanceof Error ? error.message : String(error));
});

window.addEventListener("pagehide", () => { host?.dispose(); runtimeWorker?.terminate(); });
