import { MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { describeImageArtifact, saveImageArtifact, sha256,
  loadPackagedSnapshotMetadata, streamPackagedSystemSnapshot } from "./image-artifact.mjs";
import { imageInputs } from "./image-inputs.mjs";
import { inspectDollyfile, MAX_DOLLYFILE_BYTES } from "./dollyfile-view.mjs";
import { decodeImageEntry } from "./image-entry.mjs";
import { checkedCustomArtifact } from "./custom-image.mjs";
import { CANONICAL_ORIGIN, decodeStaticAsset, hex } from "./static-asset.mjs";
import { terminalFailureReason } from "./process-supervisor.mjs";
import { bootFiles } from "../host/runtime/boot-files.mjs";

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

const applicationBase = new URL("../", import.meta.url);
function locateArtifact(path) {
  if (path !== "dolly.wasm" && path !== "dolly.data") {
    throw new Error("unknown fixed kernel artifact");
  }
  return new URL(`dist/${path}`, applicationBase).href;
}

// A rejected promise, not a throw, when the entry cannot be read or decoded.
async function runImageEntry(files, supervisor) {
  return supervisor.spawn(decodeImageEntry(files.read("/etc/dolly/entry", 64 * 1024)), { foreground: true });
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
  const declared = bootMode === "snapshot" ? snapshotMetadata.hostRequirements ?? definition?.hostRequirements ?? []
    : configuredImage === "custom" ? inspectDollyfile(bootConfig.customSource).hostRequirements : definition.hostRequirements;
  if (!bootConfig.buildOnly && bootMode === "snapshot") host.require(declared);
  // A build runs the engine and its tools with the build host's modules too.
  host.admit(bootMode === "rebuild" ? [...declared, ...host.enabled] : declared);
  const recipeSha256 = configuredImage === "custom"
    ? await sha256(encoder.encode(bootConfig.customSource)) : definition.sha256;
  const baseReference = configuredImage === "custom"
    ? inspectDollyfile(bootConfig.customSource).from : definition.artifacts.find(reference => reference.operation === "from");
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
  bootstrapStage("creating wasm64 userspace kernel...");
  const memory = host.kernel.memory;
  // Fixed deployment input, never a filename or URL supplied by Wasm.
  const kernelModule = await WebAssembly.compileStreaming(fetch(locateArtifact("dolly.wasm")));
  const kernel = new WebAssembly.Instance(kernelModule, host.imports(kernelModule)).exports;
  kernel._initialize();
  // Host modules and the supervisor name kernel exports as Emscripten's glue did.
  const dolly = Object.fromEntries(Object.entries(kernel).map(([name, value]) => [`_${name}`, value]));
  const files = bootFiles(kernel, memory);
  if (bootMode === "rebuild" && !baseArtifact) {
    bootstrapStage("loading root compiler seed...");
    const { default: loadSeed } = await import("../dist/dolly-seed.mjs");
    // Static hosts may serve the seed as verified parts; the packager takes the joined bytes.
    const seedURL = locateArtifact("dolly.data");
    const seed = await (await decodeStaticAsset(await fetch(seedURL), seedURL, {}, snapshotSizeLimit)).arrayBuffer();
    // The file packager's generated index asks for these five functions; it
    // names each file's range in the seed, and writing a file makes its parents.
    await loadSeed({
      getPreloadedPackage: () => seed,
      FS_createPath() {},
      FS_createDataFile: (path, _name, bytes) => files.write(path, bytes),
      addRunDependency() {},
      removeRunDependency() {},
    });
  }
  bootstrapStage("Dolly runtime loaded");

  const recipeLocator = configuredImage === "custom"
    ? "FILE:/etc/dolly/upload.Dollyfile" : `${CANONICAL_ORIGIN}/${definition.dollyfile}`;
  files.write("/etc/dolly/recipe.locator", recipeLocator);
  if (configuredImage === "custom") {
    files.write("/etc/dolly/upload.Dollyfile", bootConfig.customSource);
  }
  const releaseInput = artifact => {
    if (bootConfig.buildOnly) self.postMessage({ type: "build-input", recipeSha256: artifact.recipeSha256,
      bytes: artifact.bytes }, [artifact.bytes]);
    else artifact.bytes.transfer(0);
    artifact.bytes = null;
  };
  for (const artifact of artifacts.values()) {
    files.write(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`, new Uint8Array(artifact.bytes));
    if (artifact !== baseArtifact) releaseInput(artifact);
  }
  const restoreMetadata = snapshotMetadata ?? baseArtifact;
  if (restoreMetadata) {
    files.write("/etc/dolly/image.manifest", `${restoreMetadata.manifest.join("\n")}\n`);
  }

  await host.start("kernel", { dolly, memory, kernelExports: kernel });

  let bootstrapStatus;
  let snapshotBytes;
  let finishRebuiltImage = false;
  if (bootMode === "rebuild") {
    bootstrapStage("building userspace from the Dollyfile...");
    if (baseArtifact) {
      bootstrapStage(`loading builder from ${baseReference.location}...`);
      const restoreAddress = kernel.dolly_snapshot_restore_address(BigInt(baseArtifact.bytes.byteLength));
      const range = checkedMemoryRange(memory, restoreAddress, baseArtifact.bytes.byteLength);
      new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(baseArtifact.bytes));
      bootstrapStatus = kernel.dolly_process_bootstrap_resume_prepare(BigInt(range.size), 1);
      releaseInput(baseArtifact);
    } else {
      bootstrapStatus = kernel.dolly_process_bootstrap_prepare();
    }
    if (bootstrapStatus === 0) {
      processSupervisor = await host.kernel.supervisor(dolly);
      const arguments_ = baseArtifact
        ? ["/bin/dollyfile", recipeLocator]
        : ["/usr/libexec/dolly/process-bin/bootstrap"];
      bootstrapStatus = (await processSupervisor.spawn(arguments_)).status;
    }
    for (const artifact of artifacts.values()) files.remove(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`);
    artifacts.clear();
    if (bootstrapStatus === 0) {
      bootstrapStage("capturing userspace image...");
      if (kernel.dolly_snapshot_capture() !== 0) {
        throw new Error("Dolly system snapshot capture failed");
      }
      const range = checkedMemoryRange(
        memory, kernel.dolly_snapshot_address(), kernel.dolly_snapshot_size(),
      );
      bootstrapStage("copying completed image...");
      const copy = new Uint8Array(range.size);
      copy.set(new Uint8Array(memory.buffer, range.address, range.size));
      snapshotBytes = range.size;
      if (!bootConfig.buildOnly) {
        const artifact = await describeImageArtifact(copy.buffer, recipeSha256, inputs);
        host.require(artifact.hostRequirements);
        host.admit(artifact.hostRequirements);
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
      const restoreAddress = kernel.dolly_snapshot_restore_address(BigInt(snapshot.byteLength));
      const range = checkedMemoryRange(memory, restoreAddress, snapshot.byteLength);
      new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(snapshot));
      bootstrapStatus = kernel.dolly_bootstrap_snapshot(BigInt(range.size));
      snapshotBytes = range.size;
      snapshotMetadata.bytes = undefined;
      bootConfig.customArtifact = undefined;
    } else {
      const capacity = 1024 * 1024;
      const address = kernel.dolly_snapshot_restore_address(BigInt(capacity));
      const staging = () => {
        const range = checkedMemoryRange(memory, address, capacity);
        return new Uint8Array(memory.buffer, range.address, range.size);
      };
      staging().set(Uint8Array.from(snapshotMetadata.sha256.match(/../g), byte => parseInt(byte, 16)));
      if (kernel.dolly_bootstrap_snapshot_begin(BigInt(snapshotMetadata.byteLength)) !== 0)
        throw new Error("Dolly snapshot stream initialization failed");
      let loaded = 0, reported = 0;
      await streamPackagedSystemSnapshot(configuredImage, snapshotMetadata, bytes => {
        for (let offset = 0; offset < bytes.length; offset += capacity) {
          const chunk = bytes.subarray(offset, offset + capacity);
          staging().set(chunk);
          if (kernel.dolly_snapshot_stream_write(BigInt(chunk.length), 0) !== 0)
            throw new Error("Dolly rejected a snapshot stream record");
        }
        loaded += bytes.length;
        if (performance.now() - reported >= 1000) {
          const mib = 1024 * 1024;
          bootstrapStage(`loading userspace: ${Math.min(Math.floor(loaded / mib), Math.ceil(snapshotMetadata.byteLength / mib))} / ${Math.ceil(snapshotMetadata.byteLength / mib)} MiB`);
          reported = performance.now();
        }
      }, () => {
        if (kernel.dolly_snapshot_stream_write(0n, 1) !== 0)
          throw new Error("Dolly rejected an incomplete snapshot part");
        return hex(staging().subarray(0, 32));
      });
      bootstrapStatus = kernel.dolly_bootstrap_snapshot_end();
      snapshotBytes = snapshotMetadata.byteLength;
    }
  }
  if (bootstrapStatus !== 0) throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);

  if (bootConfig.buildOnly) {
    self.close();
    return;
  }
  processSupervisor ??= await host.kernel.supervisor(dolly);

  if (finishRebuiltImage) {
    bootstrapStage("finishing image bootstrap...");
    bootstrapStatus = kernel.dolly_bootstrap_finish();
    if (bootstrapStatus !== 0) {
      throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);
    }
  }

  await host.imageRestored({ dolly, supervisor: processSupervisor, stage: bootstrapStage,
    files, image: configuredImage });
  if (kernel.dolly_bootstrap_environment() !== 0) throw new Error("Dolly image environment is invalid");

  await host.start("image", { dolly, memory, kernelExports: kernel });

  const runtimeImage = decoder.decode(files.read("/etc/dolly/image", 256));
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

  // The image ends with its ENTRY process, however that ended: a program that
  // failed or could not start is the image's ending, not the runtime's failure.
  const ending = await runImageEntry(files, processSupervisor).catch(error => {
    console.error(error);
    return { status: 126, signal: 0, failure: error.reason ?? terminalFailureReason(error) };
  });
  self.postMessage({ type: "exited", ...ending });
} catch (error) {
  self.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? "" : "",
  });
} finally {
  host?.dispose();
}
}
await boot();
