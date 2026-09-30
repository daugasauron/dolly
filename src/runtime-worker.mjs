import { installOutputDevices } from "../host/runtime/runtime.mjs";
import { MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { DOLLY_ERRNO } from "../dist/dolly-errno.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { validSessionName, DOLLY_SESSION_MAX_BYTES } from "./session-store.mjs";
import { describeImageArtifact, saveImageArtifact, sha256,
  loadPackagedSnapshotMetadata, streamPackagedSystemSnapshot } from "./image-artifact.mjs";
import { imageInputs } from "./image-inputs.mjs";
import { inspectDollyfile, MAX_DOLLYFILE_BYTES } from "./dollyfile-view.mjs";
import { decodeImageEntry } from "./image-entry.mjs";
import { checkedCustomArtifact } from "./custom-image.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

// Listen before the host registry loads its manifests: the page's configure
// message may arrive while that import is still pending.
const configured = new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Dolly boot configuration was not provided")), 10_000,
  );
  self.addEventListener("message", function configure(event) {
    if (event.data?.type !== "configure") return;
    self.removeEventListener("message", configure);
    clearTimeout(timeout);
    resolve(event.data);
  });
});
const { createHost } = await import("../host/modules.mjs");
const bootConfig = await configured;

const bootMode = bootConfig.mode === "rebuild" ? "rebuild" : "snapshot";
const configuredImage = bootConfig.image;
const imageDefinitions = new Map(
  DOLLY_IMAGES.map((definition) => [definition.image, definition]),
);
if (!(imageDefinitions.has(configuredImage) || configuredImage === "custom")) {
  throw new Error("invalid Dolly image selection");
}
if ((configuredImage === "custom" || bootConfig.customSource !== undefined) &&
    (typeof bootConfig.customSource !== "string" ||
     encoder.encode(bootConfig.customSource).byteLength > MAX_DOLLYFILE_BYTES ||
     bootConfig.customSource.includes("\0"))) {
  throw new Error("invalid uploaded Dollyfile");
}
if (bootConfig.sessionSnapshot !== undefined &&
    (!(bootConfig.sessionSnapshot instanceof ArrayBuffer) ||
     bootConfig.sessionSnapshot.byteLength < 16 ||
     bootConfig.sessionSnapshot.byteLength > DOLLY_SESSION_MAX_BYTES ||
     bootMode !== "snapshot")) {
  throw new Error("invalid Dolly session snapshot");
}

if (bootConfig.recoverSession !== undefined &&
    (!validSessionName(bootConfig.recoverSession) || bootConfig.sessionSnapshot === undefined ||
     configuredImage !== "system")) throw new Error("invalid Dolly file recovery request");

const applicationBase = new URL("../", import.meta.url);
function locateArtifact(path) {
  if (path !== "dolly.wasm" && path !== "dolly.data") {
    throw new Error("unknown fixed kernel artifact");
  }
  return new URL(`dist/${path}`, applicationBase).href;
}

// Guest-writable files are bounded before trusted code copies them.
function readBoundedFile(dolly, path, limit) {
  if (dolly.FS.stat(path).size > limit) throw new Error(`${path} is larger than ${limit} bytes`);
  return dolly.FS.readFile(path);
}

function readImageEntry(dolly) {
  return decodeImageEntry(readBoundedFile(dolly, "/etc/dolly/entry", 64 * 1024));
}

async function runImageEntry(dolly, supervisor) {
  const arguments_ = readImageEntry(dolly);
  return supervisor.spawn(arguments_, { foreground: true });
}

function checkedMemoryRange(memory, addressValue, sizeValue) {
  const address = Number(addressValue);
  const size = Number(sizeValue);
  if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) ||
      address <= 0 || size <= 0 || size > snapshotSizeLimit ||
      address > memory.buffer.byteLength - size) {
    throw new Error("Wasm published an invalid system snapshot memory range");
  }
  return { address, size };
}

function bootstrapOutput(text, error = false) {
  self.postMessage({ type: "bootstrap", text, error });
}

function bootstrapStage(text) {
  bootstrapOutput(`${text}\n`);
}

async function waitForBrowserAcknowledgement(type, failure) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(failure)), 10_000);
    self.addEventListener("message", function acknowledge(event) {
      if (event.data?.type !== type) return;
      self.removeEventListener("message", acknowledge);
      clearTimeout(timeout);
      resolve();
    });
  });
}

let dolly = null;
let processSupervisor = null;
let host;
self.addEventListener("message", event => { void host?.handle(event.data).catch(error => {
  host.dispose();
  self.postMessage({ type: "error", message: error.message });
}); });
async function boot() {
try {
  host = await createHost("worker", bootConfig.hostModules, {
    send: (message, transfers = []) => self.postMessage(message, transfers),
    configuration: bootConfig.hostConfiguration,
    resources: { applicationBase },
  });
  const snapshotMetadata = bootMode === "snapshot"
    ? configuredImage === "custom" ? await checkedCustomArtifact(bootConfig.customSource, bootConfig.customArtifact)
      : await loadPackagedSnapshotMetadata(configuredImage)
    : null;
  const definition = imageDefinitions.get(configuredImage);
  if (!bootConfig.buildOnly && bootMode === "snapshot") {
    host.require(snapshotMetadata.hostRequirements ?? definition?.hostRequirements ?? []);
  }
  const recipeSha256 = configuredImage === "custom"
    ? await sha256(encoder.encode(bootConfig.customSource)) : definition.sha256;
  const baseReference = configuredImage === "custom"
    ? inspectDollyfile(bootConfig.customSource).from : definition.artifacts.find(reference => !reference.copy);
  const artifacts = new Map();
  if (bootConfig.artifacts !== undefined && (!Array.isArray(bootConfig.artifacts) || bootConfig.artifacts.length > 256)) {
    throw new Error("invalid build artifacts");
  }
  for (const candidate of bootConfig.artifacts ?? []) {
    if (candidate?.buildId !== DOLLY_IMAGE_BUILD_ID || !/^[0-9a-f]{64}$/.test(candidate.recipeSha256) ||
        !(candidate.bytes instanceof ArrayBuffer) || await sha256(candidate.bytes) !== candidate.sha256) {
      throw new Error("build artifact integrity mismatch");
    }
    artifacts.set(candidate.recipeSha256, await describeImageArtifact(candidate.bytes, candidate.recipeSha256));
  }
  bootConfig.artifacts = undefined;
  const inputs = imageInputs([...artifacts.values()]);
  const baseArtifact = baseReference ? artifacts.get(baseReference.sha256) : null;
  if (bootMode === "rebuild" && baseReference && !baseArtifact) throw new Error("base image artifact was not provided");
  bootstrapStage("loading Dolly runtime...");
  const nativeTextDecoder = globalThis.TextDecoder;
  globalThis.TextDecoder = undefined;
  const { default: createDolly } = await import("../dist/dolly.mjs");
  bootstrapStage("creating wasm64 userspace kernel...");
  const memory = host.get("runtime").memory;
  // Fixed deployment input, never a filename or URL supplied by Wasm.
  const kernelModule = await WebAssembly.compileStreaming(fetch(locateArtifact("dolly.wasm")));
  let kernelExports;
  const dollyOptions = {
    noInitialRun: true,
    ...host.options,
    locateFile: locateArtifact,
    instantiateWasm(imports, receive) {
      host.bindImports(kernelModule, imports);
      const instance = new WebAssembly.Instance(kernelModule, imports);
      kernelExports = instance.exports;
      receive(instance, kernelModule);
      return instance.exports;
    },

  };
  dolly = await createDolly(dollyOptions);
  globalThis.TextDecoder = nativeTextDecoder;
  if (bootMode === "rebuild" && !baseArtifact) {
    bootstrapStage("loading root compiler seed...");
    const { default: loadSeed } = await import("../dist/dolly-seed.mjs");
    await loadSeed(dolly);
  }
  bootstrapStage("Dolly runtime loaded");

  dolly.FS.mkdirTree("/dev");
  dolly.FS.mkdirTree("/home/dolly");
  // Do this after WasmFS initialization. Emscripten marks paths registered as
  // preloads read-only; boot configuration is mutable Dolly state, not part of
  // the packaged compiler seed.
  dolly.FS.mkdirTree("/etc/dolly");
  const replaceFile = (path, value) => {
    const pathBytes = encoder.encode(path);
    const dataBytes = typeof value === "string" ? encoder.encode(value) : value;
    if (!(dataBytes instanceof Uint8Array)) throw new TypeError("invalid Dolly boot file");
    const pathAddress = dolly._malloc(BigInt(pathBytes.length + 1));
    const dataAddress = dolly._malloc(BigInt(Math.max(1, dataBytes.length)));
    if (pathAddress === 0 || dataAddress === 0) throw new Error("Dolly boot allocation failed");
    try {
      const pathView = new Uint8Array(memory.buffer, Number(pathAddress), pathBytes.length + 1);
      pathView.set(pathBytes);
      pathView[pathBytes.length] = 0;
      new Uint8Array(memory.buffer, Number(dataAddress), dataBytes.length).set(dataBytes);
      const status = dolly._dolly_write_file(
        BigInt(pathAddress), BigInt(dataAddress), BigInt(dataBytes.length),
      );
      if (status !== 0) throw new Error(`Dolly could not write ${path}: status ${status}`);
    } finally {
      dolly._free(BigInt(dataAddress));
      dolly._free(BigInt(pathAddress));
    }
  };
  const recipeLocator = configuredImage === "custom"
    ? "FILE:/etc/dolly/upload.Dollyfile"
    : configuredImage === "default" ? "/Dollyfile" : `/Dollyfile-${configuredImage}`;
  replaceFile("/etc/dolly/recipe.locator", recipeLocator);
  replaceFile("/etc/dolly/host.base", applicationBase.href);
  if (configuredImage === "custom") {
    replaceFile("/etc/dolly/upload.Dollyfile", bootConfig.customSource);
  }
  dolly.FS.mkdirTree("/etc/dolly/artifacts");
  const releaseInput = artifact => {
    if (bootConfig.buildOnly) self.postMessage({ type: "build-input", recipeSha256: artifact.recipeSha256,
      bytes: artifact.bytes }, [artifact.bytes]);
    else artifact.bytes.transfer(0);
    artifact.bytes = null;
  };
  for (const artifact of artifacts.values()) {
    replaceFile(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`, new Uint8Array(artifact.bytes));
    if (artifact !== baseArtifact) releaseInput(artifact);
  }
  const restoreMetadata = snapshotMetadata ?? baseArtifact;
  if (restoreMetadata) {
    replaceFile("/etc/dolly/image.manifest", `${restoreMetadata.manifest.join("\n")}\n`);
  }
  installOutputDevices(dolly);

  await host.start("kernel", { dolly, memory, kernelExports });

  let bootstrapStatus;
  let snapshotBytes;
  let finishRebuiltImage = false;
  if (bootMode === "rebuild") {
    bootstrapStage("building userspace from the Dollyfile...");
    if (baseArtifact) {
      bootstrapStage(`loading builder from ${baseReference.location}...`);
      const restoreAddress = dolly._dolly_snapshot_restore_address(BigInt(baseArtifact.bytes.byteLength));
      const range = checkedMemoryRange(memory, restoreAddress, baseArtifact.bytes.byteLength);
      new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(baseArtifact.bytes));
      bootstrapStatus = dolly._dolly_process_bootstrap_resume_prepare(BigInt(range.size), 1);
      releaseInput(baseArtifact);
    } else {
      bootstrapStatus = dolly._dolly_process_bootstrap_prepare();
    }
    if (bootstrapStatus === 0) {
      processSupervisor = await host.get("runtime").supervisor(dolly);
      const arguments_ = baseArtifact
        ? ["/bin/dollyfile", recipeLocator, applicationBase.href]
        : ["/usr/libexec/dolly/process-bin/bootstrap"];
      bootstrapStatus = await processSupervisor.spawn(arguments_);
    }
    for (const artifact of artifacts.values()) dolly.FS.unlink(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`);
    artifacts.clear();
    if (bootstrapStatus === 0) {
      bootstrapStage("capturing userspace image...");
      if (dolly._dolly_snapshot_capture() !== 0) {
        throw new Error("Dolly system snapshot capture failed");
      }
      const range = checkedMemoryRange(
        memory, dolly._dolly_snapshot_address(), dolly._dolly_snapshot_size(),
      );
      bootstrapStage("copying completed image...");
      const copy = new Uint8Array(range.size);
      copy.set(new Uint8Array(memory.buffer, range.address, range.size));
      snapshotBytes = range.size;
      if (!bootConfig.buildOnly) {
        const artifact = await describeImageArtifact(copy.buffer, recipeSha256, inputs);
        host.require(artifact.hostRequirements);
        const cacheSlot = configuredImage === "custom"
          ? `custom:${inspectDollyfile(bootConfig.customSource).image}` : `/${definition.dollyfile}`;
        const saved = await saveImageArtifact(artifact, cacheSlot);
        bootstrapStage(saved ? "saved completed image artifact" : "image built; local cache unavailable");
      }
      self.postMessage({ type: "system-snapshot", bytes: copy.buffer, inputs }, [copy.buffer]);
      finishRebuiltImage = true;
    }
  } else {
    bootstrapStage("loading precompiled userspace snapshot...");
    if (configuredImage === "custom") {
      const snapshot = snapshotMetadata.bytes;
      const restoreAddress = dolly._dolly_snapshot_restore_address(BigInt(snapshot.byteLength));
      const range = checkedMemoryRange(memory, restoreAddress, snapshot.byteLength);
      new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(snapshot));
      bootstrapStatus = dolly._dolly_bootstrap_snapshot(BigInt(range.size));
      snapshotBytes = range.size;
      snapshotMetadata.bytes = undefined;
      bootConfig.customArtifact = undefined;
    } else {
      const capacity = 1024 * 1024;
      const address = dolly._dolly_snapshot_restore_address(BigInt(capacity));
      const staging = () => {
        const range = checkedMemoryRange(memory, address, capacity);
        return new Uint8Array(memory.buffer, range.address, range.size);
      };
      staging().set(Uint8Array.from(snapshotMetadata.sha256.match(/../g), byte => parseInt(byte, 16)));
      if (dolly._dolly_bootstrap_snapshot_begin(BigInt(snapshotMetadata.byteLength)) !== 0)
        throw new Error("Dolly snapshot stream initialization failed");
      let loaded = 0, reported = 0;
      await streamPackagedSystemSnapshot(configuredImage, snapshotMetadata, bytes => {
        for (let offset = 0; offset < bytes.length; offset += capacity) {
          const chunk = bytes.subarray(offset, offset + capacity);
          staging().set(chunk);
          if (dolly._dolly_snapshot_stream_write(BigInt(chunk.length), 0) !== 0)
            throw new Error("Dolly rejected a snapshot stream record");
        }
        loaded += bytes.length;
        if (performance.now() - reported >= 1000) {
          const mib = 1024 * 1024;
          bootstrapStage(`loading userspace: ${Math.min(Math.floor(loaded / mib), Math.ceil(snapshotMetadata.byteLength / mib))} / ${Math.ceil(snapshotMetadata.byteLength / mib)} MiB`);
          reported = performance.now();
        }
      }, () => {
        if (dolly._dolly_snapshot_stream_write(0n, 1) !== 0)
          throw new Error("Dolly rejected an incomplete snapshot part");
        return [...staging().subarray(0, 32)].map(byte => byte.toString(16).padStart(2, "0")).join("");
      });
      bootstrapStatus = dolly._dolly_bootstrap_snapshot_end();
      snapshotBytes = snapshotMetadata.byteLength;
    }
  }
  if (bootstrapStatus !== 0) throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);

  if (bootConfig.buildOnly) {
    self.close();
    return;
  }
  processSupervisor ??= await host.get("runtime").supervisor(dolly);

  if (finishRebuiltImage) {
    bootstrapStage("finishing image bootstrap...");
    bootstrapStatus = dolly._dolly_bootstrap_finish();
    if (bootstrapStatus !== 0) {
      throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);
    }
  }

  // Image pruning removes bootstrap inputs. Publish the current release URL
  // after artifact capture/restore so portable images never retain a build host.
  replaceFile("/etc/dolly/host.base", applicationBase.href);
  if (bootConfig.sessionSnapshot !== undefined) host.require(["snapshot@0"]);
  host.get("snapshot")?.captureBase(dolly);
  if (bootConfig.recoverSession !== undefined) {
    const path = "/tmp/dolly-session-recovery.delta";
    const destination = `/workspace/recovered-${bootConfig.recoverSession}`;
    bootstrapStage(`recovering saved files into ${destination}...`);
    replaceFile(path, new Uint8Array(bootConfig.sessionSnapshot));
    bootConfig.sessionSnapshot.transfer(0);
    bootConfig.sessionSnapshot = undefined;
    try {
      const program = "/usr/bin/session-recover";
      if (await processSupervisor.spawn([program, path, destination]) !== 0) {
        throw new Error("File recovery failed; the original saved session is unchanged");
      }
    } finally { dolly.FS.unlink(path); }
  } else if (bootConfig.sessionSnapshot !== undefined) {
    bootstrapStage("restoring named session filesystem...");
    host.get("snapshot").restore(dolly, bootConfig.sessionSnapshot);
    bootConfig.sessionSnapshot.transfer(0);
    bootConfig.sessionSnapshot = undefined;
    bootstrapStage("named session filesystem restored");
  }

  await host.start("image", { dolly, memory, kernelExports });

  const runtimeImage = decoder.decode(readBoundedFile(dolly, "/etc/dolly/image", 256));
  if (configuredImage !== "custom" && runtimeImage !== configuredImage) {
    throw new Error(`Dollyfile selected image ${runtimeImage}, expected ${configuredImage}`);
  }
  bootstrapStage("starting image entry...");
  const entryReady = waitForBrowserAcknowledgement(
    "entry-ready-ack",
    "browser did not acknowledge image startup",
  );
  self.postMessage({
    type: "ready",
    image: runtimeImage,
    routeImage: configuredImage,
    bootMode,
    snapshotBytes,
    buildId: DOLLY_BUILD_ID,
    hostModules: host.enabled,
  });
  await entryReady;

  const status = await runImageEntry(dolly, processSupervisor);
  self.postMessage({ type: "exited", status });
} catch (error) {
  let compilerTrace = "";
  try {
    compilerTrace = dolly === null
      ? ""
      : decoder.decode(readBoundedFile(dolly, "/tmp/dolly-cc-trace.log", 64 * 1024)).trim();
  } catch {
    // Compiler tracing is opt-in and absent in normal sessions.
  }
  const message = error instanceof Error ? error.message : String(error);
  self.postMessage({
    type: "error",
    message: compilerTrace === "" ? message : `${message}\n${compilerTrace}`,
    stack: error instanceof Error ? error.stack ?? "" : "",
  });
} finally {
  host?.dispose();
}
}
await boot();
