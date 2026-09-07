import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_ERRNO } from "../dist/dolly-errno.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { describeImageArtifact, saveImageArtifact, sha256,
  loadPackagedSnapshotMetadata, loadPackagedSystemSnapshot } from "./image-artifact.mjs";
import { imageInputs } from "./image-inputs.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";
import { DollyProcessSupervisor } from "./process-supervisor.mjs";
import { instantiateKernelPlugin } from "./kernel-plugin.mjs";
import { decodeImageEntry } from "./image-entry.mjs";
import { createHttpAdmission } from "./http-broker.mjs";
import { checkedCustomArtifact } from "./custom-image.mjs";

const MAX_DOLLYFILE_BYTES = 128 * 1024;
const snapshotSizeLimit = 512 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

const bootConfig = await new Promise((resolve, reject) => {
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
     bootConfig.sessionSnapshot.byteLength > snapshotSizeLimit ||
     bootMode !== "snapshot")) {
  throw new Error("invalid Dolly session snapshot");
}

const applicationBase = new URL("../", import.meta.url);
function locateArtifact(path) {
  if (path !== "dolly.wasm" && path !== "dolly.data") {
    throw new Error("unknown fixed kernel artifact");
  }
  return new URL(`dist/${path}`, applicationBase).href;
}

function readImageEntry(dolly) {
  return decodeImageEntry(dolly.FS.readFile("/etc/dolly/entry"));
}

async function runImageEntry(dolly, supervisor) {
  const arguments_ = readImageEntry(dolly);
  return supervisor.spawn(arguments_[0], arguments_, {
    foreground: true,
  });
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

function createDollyMemory() {
  try {
    return new WebAssembly.Memory({
      initial: 1024n, maximum: 131072n, shared: true, address: "i64",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Dolly requires shared WebAssembly memory64, but this browser rejected " +
      `the memory64 JavaScript API (${detail}). Dolly intentionally has no wasm32 fallback.`,
      { cause: error },
    );
  }
}

function installOutputDevice(dolly, path, deviceNumber) {
  const device = dolly.FS.makedev(80, deviceNumber);
  dolly.FS.registerDevice(device, {
    read() { return 0; },
    write(_stream, buffer, offset, length) {
      if (buffer.length - offset < length) {
        const error = new Error("invalid WasmFS device write range");
        error.errno = DOLLY_ERRNO.EFAULT;
        throw error;
      }
      dolly._dolly_terminal_write_bytes(BigInt(buffer.byteOffset + offset), BigInt(length));
      return length;
    },
  });
  dolly.FS.mkdev(path, 0o222, device);
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
const httpAdmission = createHttpAdmission(request => self.postMessage({ type: "http-request", ...request }));
async function boot() {
try {
  const snapshotMetadata = bootMode === "snapshot"
    ? configuredImage === "custom" ? await checkedCustomArtifact(bootConfig.customSource, bootConfig.customArtifact)
      : await loadPackagedSnapshotMetadata(configuredImage)
    : null;
  const definition = imageDefinitions.get(configuredImage);
  const recipeSha256 = configuredImage === "custom"
    ? await sha256(encoder.encode(bootConfig.customSource)) : definition.sha256;
  const baseReference = configuredImage === "custom"
    ? inspectDollyfile(bootConfig.customSource).from : definition.artifacts.find(reference => !reference.copy);
  const artifacts = new Map();
  if (bootConfig.artifacts !== undefined && (!Array.isArray(bootConfig.artifacts) || bootConfig.artifacts.length > 256)) {
    throw new Error("invalid build artifacts");
  }
  for (const candidate of bootConfig.artifacts ?? []) {
    if (candidate?.buildId !== DOLLY_BUILD_ID || !/^[0-9a-f]{64}$/.test(candidate.recipeSha256) ||
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
  const memory = createDollyMemory();
  // Fixed deployment input, never a filename or URL supplied by Wasm.
  const kernelModule = await WebAssembly.compileStreaming(fetch(locateArtifact("dolly.wasm")));
  let kernelExports;
  const dollyOptions = {
    noInitialRun: true,
    wasmMemory: memory,
    locateFile: locateArtifact,
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(kernelModule, imports);
      kernelExports = instance.exports;
      receive(instance, kernelModule);
      return instance.exports;
    },
    bootstrapWriteBytes: (bytes) => self.postMessage({ type: "bootstrap-bytes", bytes }),
    httpDispatch: httpAdmission.dispatch,
    downloadDispatch: ({ name, bytes }) => {
      if (bootConfig.buildOnly) return -DOLLY_ERRNO.ENOSYS;
      if (typeof name !== "string" || name.length === 0 || name.length > 255 ||
          /[\/\\\u0000-\u001f\u007f]/u.test(name) ||
          !(bytes instanceof Uint8Array) || bytes.byteLength > 64 * 1024 * 1024) {
        return -DOLLY_ERRNO.EINVAL;
      }
      self.postMessage(
        { type: "download", name, bytes: bytes.buffer },
        [bytes.buffer],
      );
      return 0;
    },
    print: (text) => bootstrapOutput(`${text}\n`),
    printErr: (text) => bootstrapOutput(`${text}\n`, true),
  };
  dolly = await createDolly(dollyOptions);
  globalThis.TextDecoder = nativeTextDecoder;
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
  for (const artifact of artifacts.values()) {
    replaceFile(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`, new Uint8Array(artifact.bytes));
    if (artifact !== baseArtifact) artifact.bytes = null;
  }
  const restoreMetadata = snapshotMetadata ?? baseArtifact;
  if (restoreMetadata) {
    replaceFile("/etc/dolly/image.manifest", `${restoreMetadata.manifest.join("\n")}\n`);
  }
  installOutputDevice(dolly, "/dev/dolly-stdout", 1);
  installOutputDevice(dolly, "/dev/dolly-stderr", 2);

  const brokerReady = waitForBrowserAcknowledgement(
    "broker-ready-ack",
    "browser HTTP broker did not acknowledge the runtime",
  );
  self.postMessage({
    type: "broker-ready",
    httpAdmission: httpAdmission.control.buffer,
    memory: memory.buffer,
    httpAddress: Number(dolly._dolly_http_mailbox_address()),
    httpCapacity: dolly._dolly_http_chunk_capacity(),
    httpVersion: dolly._dolly_http_mailbox_version(),
  });
  await brokerReady;

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
      baseArtifact.bytes = null;
    } else {
      bootstrapStatus = dolly._dolly_process_bootstrap_prepare();
    }
    if (bootstrapStatus === 0) {
      processSupervisor = await DollyProcessSupervisor.create(dolly, memory, applicationBase);
      const arguments_ = baseArtifact
        ? ["/bin/dollyfile", recipeLocator, applicationBase.href]
        : ["/usr/libexec/dolly/process-bin/bootstrap"];
      bootstrapStatus = await processSupervisor.spawn(arguments_[0], arguments_);
    }
    for (const artifact of artifacts.values()) dolly.FS.unlink(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`);
    artifacts.clear();
    if (bootstrapStatus === 0) {
      if (dolly._dolly_snapshot_capture() !== 0) {
        throw new Error("Dolly system snapshot capture failed");
      }
      const range = checkedMemoryRange(
        memory, dolly._dolly_snapshot_address(), dolly._dolly_snapshot_size(),
      );
      const copy = new Uint8Array(range.size);
      copy.set(new Uint8Array(memory.buffer, range.address, range.size));
      snapshotBytes = range.size;
      const artifact = await describeImageArtifact(copy.buffer, recipeSha256, inputs);
      const cacheSlot = configuredImage === "custom"
        ? `custom:${inspectDollyfile(bootConfig.customSource).image}` : `/${definition.dollyfile}`;
      const saved = await saveImageArtifact(artifact, cacheSlot);
      bootstrapStage(saved ? "saved completed image artifact" : "image built; local cache unavailable");
      self.postMessage({ type: "system-snapshot", bytes: copy.buffer, inputs }, [copy.buffer]);
      finishRebuiltImage = true;
    }
  } else {
    bootstrapStage("loading precompiled userspace snapshot...");
    const snapshot = configuredImage === "custom" ? snapshotMetadata.bytes
      : await loadPackagedSystemSnapshot(configuredImage, snapshotMetadata);
    const restoreAddress = dolly._dolly_snapshot_restore_address(BigInt(snapshot.byteLength));
    const range = checkedMemoryRange(memory, restoreAddress, snapshot.byteLength);
    new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(snapshot));
    bootstrapStatus = dolly._dolly_bootstrap_snapshot(BigInt(range.size));
    snapshotBytes = range.size;
    if (configuredImage === "custom") {
      snapshotMetadata.bytes = undefined;
      bootConfig.customArtifact = undefined;
    }
  }
  if (bootstrapStatus !== 0) throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);

  if (bootConfig.buildOnly) {
    self.close();
    return;
  }
  processSupervisor ??= await DollyProcessSupervisor.create(dolly, memory, applicationBase);

  if (finishRebuiltImage) {
    bootstrapStage("starting sandbox display...");
    bootstrapStatus = dolly._dolly_bootstrap_finish();
    if (bootstrapStatus !== 0) {
      throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);
    }
  }

  bootstrapStage("indexing session baseline...");
  if (dolly._dolly_session_base_capture() !== 0) {
    throw new Error("Dolly could not index the base filesystem for sessions");
  }
  if (bootConfig.sessionSnapshot !== undefined) {
    bootstrapStage("restoring named session filesystem...");
    const size = bootConfig.sessionSnapshot.byteLength;
    const address = dolly._dolly_session_restore_address(BigInt(size));
    const range = checkedMemoryRange(memory, address, size);
    new Uint8Array(memory.buffer, range.address, range.size)
      .set(new Uint8Array(bootConfig.sessionSnapshot));
    bootConfig.sessionSnapshot = undefined;
    if (dolly._dolly_session_restore(BigInt(size)) !== 0) {
      throw new Error("Dolly session filesystem restore failed; the saved copy is unchanged");
    }
    bootstrapStage("named session filesystem restored");
  }

  // The loader is called once by trusted boot code. There is no corresponding
  // Wasm import, and its input is a bounded copy of bytes read by the kernel.
  const displayRange = checkedMemoryRange(
    memory, dolly._dolly_display_module_address(), dolly._dolly_display_module_size(),
  );
  if (displayRange.size > 64 * 1024 * 1024) {
    throw new Error("resident display plugin exceeds its byte limit");
  }
  const display = instantiateKernelPlugin(
    new Uint8Array(memory.buffer, displayRange.address, displayRange.size).slice(),
    kernelExports, memory,
  );
  const getDriver = display.exports.dolly_display_driver_get_v3;
  if (typeof getDriver !== "function" || dolly._dolly_display_install(getDriver()) !== 0) {
    throw new Error("Dolly display installation failed");
  }

  const runtimeImage = decoder.decode(dolly.FS.readFile("/etc/dolly/image"));
  if (configuredImage !== "custom" && runtimeImage !== configuredImage) {
    throw new Error(`Dollyfile selected image ${runtimeImage}, expected ${configuredImage}`);
  }
  bootstrapStage("starting image entry...");
  const displayReady = waitForBrowserAcknowledgement(
    "display-ready-ack",
    "browser display did not acknowledge the runtime",
  );
  self.postMessage({
    type: "ready",
    image: runtimeImage,
    routeImage: configuredImage,
    bootMode,
    snapshotBytes,
    buildId: DOLLY_BUILD_ID,
    memory: memory.buffer,
    address: Number(dolly._dolly_display_mailbox_address()),
    eventSize: dolly._dolly_display_event_size(),
    eventCapacity: dolly._dolly_display_event_capacity(),
    version: dolly._dolly_display_mailbox_version(),
    frameAddresses: [
      Number(dolly._dolly_display_framebuffer_address(0)),
      Number(dolly._dolly_display_framebuffer_address(1)),
    ],
    frameCapacity: Number(dolly._dolly_display_framebuffer_capacity()),
    pasteAddress: Number(dolly._dolly_display_paste_buffer_address()),
    copyAddress: Number(dolly._dolly_display_copy_buffer_address()),
    clipboardCapacity: dolly._dolly_display_clipboard_capacity(),
    sessionAddress: Number(dolly._dolly_session_mailbox_address()),
    sessionVersion: dolly._dolly_session_mailbox_version(),
    sessionNameAddress: Number(dolly._dolly_session_name_address()),
    sessionNameCapacity: dolly._dolly_session_name_capacity(),
    sessionTransferAddress: Number(dolly._dolly_session_transfer_address()),
    sessionTransferCapacity: dolly._dolly_session_transfer_capacity(),
    uploadAddress: Number(dolly._dolly_upload_mailbox_address()),
    uploadVersion: dolly._dolly_upload_mailbox_version(),
    httpAddress: Number(dolly._dolly_http_mailbox_address()),
    httpCapacity: dolly._dolly_http_chunk_capacity(),
    httpVersion: dolly._dolly_http_mailbox_version(),
  });
  await displayReady;

  const status = await runImageEntry(dolly, processSupervisor);
  self.postMessage({ type: "exited", status });
} catch (error) {
  let compilerTrace = "";
  try {
    compilerTrace = dolly === null
      ? ""
      : decoder.decode(dolly.FS.readFile("/tmp/dolly-cc-trace.log")).trim();
  } catch {
    // Compiler tracing is opt-in and absent in normal sessions.
  }
  const message = error instanceof Error ? error.message : String(error);
  self.postMessage({
    type: "error",
    message: compilerTrace === "" ? message : `${message}\n${compilerTrace}`,
    stack: error instanceof Error ? error.stack ?? "" : "",
  });
}
}
await boot();
