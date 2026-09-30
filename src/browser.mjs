import { buildLog } from "./build-log.mjs";
import { createHost, buildHost } from "./host/modules.mjs";
import { DisplayTransport } from "./host/display.mjs";
import { prepareImageArtifacts, loadImageHostRequirements } from "./image-build.mjs";
import { buildImage } from "./image-builder.mjs";
import { mountImageBuild } from "./image-build-ui.mjs";
import { loadCustomImage } from "./custom-image.mjs";
import { describeImageArtifact, sha256 } from "./image-artifact.mjs";
import { consumeDollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "./http-policy.mjs";
import { localServicesTransport } from "./local-services.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION,
  decodeSessionSnapshot,
  encodeSessionStream,
  loadStoredSession,
  saveStoredSession,
  sessionImageIdentity,
  customSessionIdentity,
  sessionCompatible,
  sessionLoadUrl,
  validSessionName,
} from "./session-store.mjs";
import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";

const mount = document.querySelector("#terminal");
const canvas = document.querySelector("#display");
const keyboard = document.querySelector("#keyboard");
const bootstrapLog = document.querySelector("#bootstrap-log");
const sessionButton = document.querySelector("#session-open");
const sessionDialog = document.querySelector("#session-dialog");
const sessionName = document.querySelector("#session-name");
const sessionDetail = document.querySelector("#session-detail");
const bootstrapOutput = buildLog(bootstrapLog);
bootstrapOutput.clear();
const appendBootstrap = text => bootstrapOutput.append(text);

const encoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
const bootstrapDecoder = new TextDecoder();
const runtimeFailureRejectors = new Set();

let runtimeWorker;
let host;
let transport;
let sessionTransport;
let networkTransport;
let presenter;
let resizeObserver;
let runtimeReady = false;
let builtSystemSnapshot = null;
let builtSystemInputs = null;
let rebuiltSessionBaseVerified = false;
let activeImage = null;
let activeImageIdentity = null;
let activeCustomImage;
let currentSessionName = null;
let sessionSavePromise = null;
let sessionSaveController = null;
let sessionStatusTimer;
let lastSessionSave = null;
const heldKeys = new Map();

function displayFatal(message) {
  for (const reject of runtimeFailureRejectors) reject(new Error(message));
  runtimeFailureRejectors.clear();
  host?.dispose();
  resizeObserver?.disconnect();
  runtimeWorker?.terminate();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  sessionSaveController?.abort(new Error("The runtime stopped; the previous save is unchanged"));
  canvas.hidden = true;
  bootstrapLog.hidden = false;
  appendBootstrap(`\nFATAL\n${message}\n`);
  document.documentElement.dataset.dollyStatus = "failed";
}

async function toggleFullscreen(event) {
  if (event.key !== "F11") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
  } catch {
    document.documentElement.dataset.fullscreen = "failed";
  }
}

function sendResize() {
  if (!transport) return;
  if (!transport.pushResize(mount.clientWidth, mount.clientHeight, devicePixelRatio)) {
    requestAnimationFrame(sendResize);
  }
}

function showSessionStatus(message, persistent = false) {
  const status = document.querySelector("#session-status");
  clearTimeout(sessionStatusTimer);
  status.textContent = message;
  status.hidden = false;
  if (!persistent) sessionStatusTimer = setTimeout(() => { status.hidden = true; }, 6000);
}

function updateSessionControls(message) {
  const failed = document.documentElement.dataset.sessionStatus === "failed";
  sessionButton.toggleAttribute("data-failed", failed);
  sessionButton.textContent = failed ? "Save failed" : lastSessionSave
    ? `Save · ${lastSessionSave.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`
    : currentSessionName ? "Save · restored" : "Save · not saved";
  sessionButton.title = message ?? (lastSessionSave
    ? `Last saved ${lastSessionSave.toLocaleTimeString()} · Ctrl+Shift+S saves again`
    : currentSessionName ? `Restored ${currentSessionName} · Ctrl+Shift+S saves changes`
    : "Not saved yet · Ctrl+Shift+S saves this session");
  sessionDetail.textContent = message ?? (lastSessionSave
    ? `${currentSessionName} · Last saved ${lastSessionSave.toLocaleTimeString()}.`
    : currentSessionName ? `Restored ${currentSessionName}. Later changes need another save.`
    : "Not saved yet. Refreshing or closing this tab loses its changes.");
}

function releaseHeldKeys() {
  for (const key of heldKeys.values()) transport?.pushKey({ ...key, type: "keyup",
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });
  heldKeys.clear();
}

function openSessionDialog() {
  releaseHeldKeys();
  if (document.pointerLockElement) document.exitPointerLock();
  sessionName.value = currentSessionName ?? activeImage ?? "session";
  updateSessionControls(document.documentElement.dataset.sessionStatus === "failed"
    ? `Save failed: ${document.documentElement.dataset.sessionError}` : undefined);
  sessionDialog.showModal();
  sessionName.focus();
  sessionName.select();
}

sessionButton.addEventListener("click", openSessionDialog);
document.querySelector("#session-close").addEventListener("click", () => sessionDialog.close());
sessionDialog.addEventListener("close", () => keyboard.focus({ preventScroll: true }));
document.querySelector("#session-list").href = new URL(".", sessionLoadUrl("index", new URL("../", import.meta.url))).href;
document.querySelector("#session-form").addEventListener("submit", event => {
  event.preventDefault();
  void saveCurrentSession(sessionName.value.trim()).catch(() => {});
});

async function saveCurrentSession(requestedName) {
  if (sessionSavePromise) return sessionSavePromise;
  sessionSavePromise = (async () => {
    if (!runtimeReady || !sessionTransport || !activeImage) {
      throw new Error("Dolly is not ready to save a session");
    }
    if (activeCustomImage) await loadCustomImage(activeCustomImage.source, activeCustomImage.artifact);
    if (!activeCustomImage && builtSystemSnapshot !== null && !rebuiltSessionBaseVerified) {
      const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
        `../dist/dolly-${activeImage}-system-snapshot.mjs`);
      const digest = await crypto.subtle.digest("SHA-256", builtSystemSnapshot);
      const actual = [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (metadata.image !== activeImage || metadata.buildId !== DOLLY_IMAGE_BUILD_ID ||
          metadata.byteLength !== builtSystemSnapshot.byteLength || metadata.sha256 !== actual) {
        throw new Error("Rebuilt filesystem differs from the prebuilt session base; no session was saved");
      }
      rebuiltSessionBaseVerified = true;
    }
    let name = requestedName ?? currentSessionName;
    if (name === null) {
      name = window.prompt("Save Dolly session as:", "");
      if (name === null) return null;
      name = name.trim();
    }
    if (!validSessionName(name)) {
      throw new Error("Session names use 1-64 letters, numbers, '.', '_' or '-'; index.html is reserved");
    }
    if (name !== currentSessionName && await loadStoredSession(name) !== null &&
        !window.confirm(`Replace the saved session '${name}'?`)) return null;
    delete document.documentElement.dataset.sessionError;
    showSessionStatus(`Saving ${name}…`, true);
    document.documentElement.dataset.sessionStatus = "capturing";
    updateSessionControls(`Saving ${name}…`);
    sessionButton.disabled = sessionName.disabled = document.querySelector("#session-save").disabled = true;
    sessionSaveController = new AbortController();
    const capture = async onChunk => {
      const result = await sessionTransport.capture(name, { signal: sessionSaveController.signal, onChunk });
      document.documentElement.dataset.sessionUncompressedBytes = String(onChunk ? result : result.byteLength);
      document.documentElement.dataset.sessionStatus = "compressing";
      return result;
    };
    const encoded = typeof CompressionStream === "function"
      ? await encodeSessionStream(capture) : { encoding: "identity", bytes: await capture() };
    document.documentElement.dataset.sessionStatus = "storing";
    const encodedSize = encoded.bytes.byteLength;
    try {
      await saveStoredSession({
        name,
        formatVersion: DOLLY_SESSION_FORMAT_VERSION,
        buildId: DOLLY_BUILD_ID,
        image: activeImage,
        imageIdentity: activeImageIdentity,
        ...(activeCustomImage ? { customImage: activeCustomImage } : {}),
        updatedAt: Date.now(),
        encoding: encoded.encoding,
        bytes: encoded.bytes,
      });
    } finally { encoded.bytes.transfer(0); }
    currentSessionName = name;
    lastSessionSave = new Date();
    document.documentElement.dataset.session = name;
    document.documentElement.dataset.sessionBytes = String(encodedSize);
    document.documentElement.dataset.sessionStatus = "saved";
    history.replaceState(null, "", sessionLoadUrl(name, new URL("../", import.meta.url)));
    showSessionStatus(`Saved ${name} locally · /session lists your saves`);
    updateSessionControls();
    return name;
  })().catch((error) => {
    document.documentElement.dataset.sessionStatus = "failed";
    document.documentElement.dataset.sessionError =
      error instanceof Error ? error.message : String(error);
    showSessionStatus(`Save failed: ${document.documentElement.dataset.sessionError}`, true);
    updateSessionControls(`Save failed: ${document.documentElement.dataset.sessionError}`);
    throw error;
  }).finally(() => {
    sessionSavePromise = null;
    sessionSaveController = null;
    sessionButton.disabled = sessionName.disabled = document.querySelector("#session-save").disabled = false;
  });
  return sessionSavePromise;
}

function requestForegroundInterrupt() {
  if (!transport) return false;
  const pid = transport.foregroundPid();
  if (pid <= 0 || !transport.foregroundInterruptible()) return false;
  if (!transport.interruptForeground()) return false;
  return true;
}

function handleKeyboardEvent(event) {
  if (event.key === "F11") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown" && !event.repeat) void toggleFullscreen(event);
    return;
  }
  if (sessionDialog.open || event.target.closest?.("#session-open")) return;
  if (document.querySelector("#file-upload[open]")) {
    if (event.type === "keydown" && event.ctrlKey && !event.shiftKey &&
        !event.altKey && !event.metaKey && event.code === "KeyC") {
      event.preventDefault();
      requestForegroundInterrupt();
    }
    return;
  }
  if (!transport) return;
  if (event.target.closest?.("#image-build")) return;
  if (event.type === "keydown" && event.key === "Escape" && document.pointerLockElement === canvas) {
    document.exitPointerLock();
    event.preventDefault();
    return;
  }
  const clipboardChord = event.ctrlKey && event.shiftKey &&
    !event.altKey && !event.metaKey;
  if (sessionTransport && clipboardChord && event.code === "KeyS") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown" && !event.repeat) {
      releaseHeldKeys();
      if (currentSessionName === null) openSessionDialog();
      else void saveCurrentSession().catch(() => {});
    }
    return;
  }
  const graphicsPaste = transport.graphicsActive() && !event.altKey && (
    (event.code === "KeyV" && (event.ctrlKey || event.metaKey)) ||
    (event.code === "Insert" && event.shiftKey && !event.ctrlKey && !event.metaKey));
  if (graphicsPaste || (clipboardChord && event.code === "KeyV")) {
    // Let the browser deliver clipboard bytes through a user-initiated PasteEvent.
    if (graphicsPaste && event.type === "keydown") keyboard.focus({ preventScroll: true });
    return;
  }
  if (clipboardChord && event.code === "KeyC") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown") {
      try {
        const text = transport.copySelection();
        if (text !== null) {
          void navigator.clipboard.writeText(text).then(
            () => { document.documentElement.dataset.clipboard = "copied"; },
            () => { document.documentElement.dataset.clipboard = "denied"; },
          );
        } else {
          document.documentElement.dataset.clipboard = "empty";
        }
      } catch (error) {
        document.documentElement.dataset.clipboard = "failed";
        document.documentElement.dataset.clipboardError =
          error instanceof Error ? error.message : String(error);
      }
    }
    return;
  }
  const interruptChord = event.type === "keydown" && event.ctrlKey &&
    !event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyC";
  if (interruptChord && requestForegroundInterrupt()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (!transport.pushKey(event)) {
    document.documentElement.dataset.inputOverflow = "true";
  }
  if (event.type === "keyup") heldKeys.delete(event.code);
  else heldKeys.set(event.code, {key:event.key,code:event.code,type:"keydown",repeat:false,
    ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey});
  event.preventDefault();
  event.stopImmediatePropagation();
}

window.addEventListener("keydown", handleKeyboardEvent, { capture: true });
window.addEventListener("keyup", handleKeyboardEvent, { capture: true });

let selecting = false;


function pointerPosition(event) {
  const gpuSurfaceSize = host?.get("gpu")?.surfaceSize;
  const bounds = canvas.getBoundingClientRect();
  const {width,height} = gpuSurfaceSize ?? canvas;
  return {
    x: bounds.width === 0 ? 0 : (event.clientX - bounds.left) * width / bounds.width,
    y: bounds.height === 0 ? 0 : (event.clientY - bounds.top) * height / bounds.height,
  };
}

function pushPointer(event, action) {
  const position = pointerPosition(event);
  if (!transport?.pushPointer(position.x, position.y, action, event)) {
    document.documentElement.dataset.inputOverflow = "true";
  }
}

function pushPointerPresence(inside) {
  if (transport?.graphicsActive() &&
      !transport.pushRecord({ type: 10, action: inside ? 1 : 0 })) {
    document.documentElement.dataset.inputOverflow = "true";
  }
}
canvas.addEventListener("pointerenter", () => pushPointerPresence(true));
canvas.addEventListener("pointerleave", () => pushPointerPresence(false));
window.addEventListener("blur", () => {
  selecting = false;
  pushPointerPresence(false);
  if (transport && !transport.pushRecord({ type: DisplayTransport.focusEvent, action: 0 })) {
    document.documentElement.dataset.inputOverflow = "true";
  }
});
window.addEventListener("focus", () => {
  if (transport && !transport.pushRecord({ type: DisplayTransport.focusEvent, action: 1 })) {
    document.documentElement.dataset.inputOverflow = "true";
  }
  pushPointerPresence(canvas.matches(":hover"));
});

canvas.addEventListener("pointerdown", (event) => {
  if (!transport || (event.button !== 0 && !transport.graphicsActive())) return;
  if (transport.relativePointerRequested()) {
    keyboard.blur();
    event.preventDefault();
    if (!event.isTrusted) return;
    if (document.pointerLockElement !== canvas) {
      const failed = error => { document.documentElement.dataset.pointerLockError = String(error); };
      try { void Promise.resolve(canvas.requestPointerLock()).catch(failed); }
      catch (error) { failed(error); }
    } else {
      pushPointer(event, 1);
    }
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  if (transport.graphicsActive()) keyboard.blur();
  else keyboard.focus({ preventScroll: true });
  selecting = true;
  pushPointer(event, 1);
  event.preventDefault();
});
canvas.addEventListener("pointermove", (event) => {
  if (document.pointerLockElement === canvas) {
    if (transport?.relativePointerRequested() && !transport.pushPointerMotion(event)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
    event.preventDefault();
    return;
  }
  if (!transport?.graphicsActive() && (!selecting || (event.buttons & 1) === 0)) return;
  pushPointer(event, 2);
  event.preventDefault();
});
canvas.addEventListener("pointerup", (event) => {
  if (!transport?.graphicsActive() && (!selecting || event.button !== 0)) return;
  selecting = false;
  pushPointer(event, 0);
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
});
canvas.addEventListener("contextmenu", event => {
  if (transport?.graphicsActive()) event.preventDefault();
});
canvas.addEventListener("pointercancel", (event) => {
  if (selecting) {
    selecting = false;
    pushPointer(event, 0);
  }
});
document.addEventListener("pointerlockchange", () => {
  selecting = false;
  const captured = document.pointerLockElement === canvas;
  document.documentElement.dataset.pointerLocked = String(captured);
  if (transport && !transport.pushRecord({ type: 9, action: captured ? 1 : 0 })) {
    document.documentElement.dataset.inputOverflow = "true";
  }
});
canvas.addEventListener("wheel", (event) => {
  if (!transport) return;
  const dimensions = transport.dimensions();
  const cellHeight = Math.max(1, transport.geometry().cellHeight);
  let deltaRows = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) deltaRows /= cellHeight;
  else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    deltaRows *= Math.max(1, dimensions.rows);
  }
  if (!transport.pushScroll(deltaRows)) {
    document.documentElement.dataset.inputOverflow = "true";
  }
  event.preventDefault();
}, { passive: false });
document.addEventListener("fullscreenchange", () => {
  document.documentElement.dataset.fullscreen = document.fullscreenElement ? "on" : "off";
  requestAnimationFrame(sendResize);
  if (!sessionDialog.open) keyboard.focus({ preventScroll: true });
});

async function submitInput(command, input = `${command}\r`) {
  const sequence = transport.currentResultSequence();
  document.documentElement.dataset.dollyCommand = command;
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
  if (!crossOriginIsolated) {
    throw new Error("Dolly requires cross-origin isolation for shared Wasm memory");
  }
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
    if (!recovering) { image = restoredSession.image; currentSessionName = name; }
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
  const buildNetwork = localServicesTransport(httpPolicy);
  const imageBuild = mountImageBuild(buildNetwork, httpPolicyConfigurations(httpPolicy));
  const applicationNetwork = localServicesTransport(httpPolicy, { build: imageBuild });
  const customSource = image === "custom"
    ? restoredSession?.customImage.source ?? sessionStorage.getItem("dolly-custom-source")
    : undefined;
  if (image === "custom" && !customSource) {
    throw new Error("No uploaded Dollyfile is available in this tab. Return to the Dolly menu.");
  }
  const requiredHost = [...await loadImageHostRequirements(image, customSource)];
  if (sessionSnapshot !== undefined) requiredHost.push("snapshot@0");
  host = await createHost("browser", globalThis.DOLLY_HOST_MODULES ??
    [...requiredHost, ...(bootMode === "rebuild" ? buildHost : [])], {
    send: (message, transfers = []) => runtimeWorker.postMessage(message, transfers),
    resources: { http: { network: applicationNetwork }, display: { canvas }, gpu: { mount } },
  });
  delete globalThis.DOLLY_HOST_MODULES;
  host.require(requiredHost);
  const customArtifact = image === "custom" && bootMode === "snapshot"
    ? await loadCustomImage(customSource, restoredSession?.customImage.artifact ??
      JSON.parse(sessionStorage.getItem("dolly-custom-artifact"))) : undefined;
  appendBootstrap(`DOLLY / ${image.toUpperCase()} / ${restoredSession
    ? `${recovering ? "RECOVER FILES FROM" : "RESTORE SESSION"} ${restoredSession.name}`
    : bootMode === "rebuild"
    ? "REBUILD FROM SOURCE"
    : "PRECOMPILED SYSTEM"}\n\n`);
  keyboard.addEventListener("compositionend", (event) => {
    if (!transport?.pushText(event.data)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
    keyboard.value = "";
  });
  window.addEventListener("paste", (event) => {
    if (event.target !== keyboard && (!transport?.graphicsActive() ||
        (event.target !== document.body && event.target !== canvas))) return;
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text && !transport?.pushPaste(text)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
  });

  const buildDependency = (image, artifacts) => buildImage(image, artifacts, buildNetwork, appendBootstrap);
  const artifacts = bootMode === "rebuild"
    ? await prepareImageArtifacts(image, customSource, buildDependency, text => appendBootstrap(`${text}\n`)) : [];

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
      host.dispose();
      const detail = message.stack ? `${message.message}\n${message.stack}` : message.message;
      for (const reject of runtimeFailureRejectors) reject(new Error(detail));
      runtimeFailureRejectors.clear();
      displayFatal(detail);
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
  presenter = host.get("display")?.presenter;
  sessionTransport = host.get("snapshot")?.transport;
  networkTransport = host.get("http")?.transport;
  activeImage = ready.routeImage === "custom" ? "custom" : ready.image;
  if (activeImage === "custom") {
    const artifact = customArtifact ?? await describeImageArtifact(builtSystemSnapshot,
      await sha256(encoder.encode(customSource)), builtSystemInputs);
    const { buildId, recipeSha256, sha256: digest, byteLength, inputs } = artifact;
    activeCustomImage = { source: customSource,
      artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs },
      policies: httpPolicyConfigurations(httpPolicy) };
    activeImageIdentity = customSessionIdentity(activeCustomImage);
  } else activeImageIdentity = sessionImageIdentity(DOLLY_IMAGES, activeImage);
  if (recovering) {
    document.documentElement.dataset.sessionStatus = "recovered";
    showSessionStatus(`Recovered files in /workspace/recovered-${restoredSession.name}. Ctrl+Shift+S saves this as a new session.`, true);
  } else if (restoredSession) {
    document.documentElement.dataset.session = restoredSession.name;
    document.documentElement.dataset.sessionStatus = "restored";
  }
  sessionButton.hidden = !sessionTransport;
  updateSessionControls();
  if (transport && !transport.pushResize(mount.clientWidth, mount.clientHeight, devicePixelRatio)) {
    throw new Error("Dolly display input ring rejected its initial resize");
  }
  runtimeWorker.postMessage({ type: "entry-ready-ack" });
  bootstrapLog.hidden = !!transport;
  canvas.hidden = !transport;
  document.documentElement.dataset.terminal = "ghostty-rgba-wasm";
  if (transport) {
    resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(mount);
  }

  keyboard.focus({ preventScroll: true });
  document.documentElement.dataset.dollyStatus = "ready";

  window.__dolly = {
    worker: runtimeWorker,
    get gpu() { return host.get("gpu")?.status ?? {}; },
    get audio() { return host.get("audio")?.status; },
    hostModules: host.enabled,
    hostUnavailable: host.unavailable,
    display: presenter,
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
      return currentSessionName;
    },
    saveSession(name) {
      return saveCurrentSession(name);
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
  networkTransport?.close();
  presenter?.stop();
  resizeObserver?.disconnect();
  runtimeWorker?.terminate();
  host?.dispose();
  displayFatal(error instanceof Error ? error.message : String(error));
});

window.addEventListener("pagehide", () => { host?.dispose(); runtimeWorker?.terminate(); });
