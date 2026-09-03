import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { loadModuleLayers, saveModuleLayers } from "./module-cache.mjs";

const MAX_DOLLYFILE_BYTES = 128 * 1024;
const snapshotSizeLimit = 512 * 1024 * 1024;
const moduleCacheBytesLimit = 512 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
if (!(imageDefinitions.has(configuredImage) ||
      (configuredImage === "custom" && bootMode === "rebuild"))) {
  throw new Error("invalid Dolly image selection");
}
if (bootConfig.customSource !== undefined &&
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
  return new URL(`dist/${path.split("/").at(-1)}`, applicationBase).href;
}

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

function removeCacheTree(dolly, path) {
  try {
    const metadata = dolly.FS.lstat(path);
    if (!dolly.FS.isDir(metadata.mode)) {
      dolly.FS.unlink(path);
      return;
    }
    for (const name of dolly.FS.readdir(path)) {
      if (name !== "." && name !== "..") removeCacheTree(dolly, `${path}/${name}`);
    }
    dolly.FS.rmdir(path);
  } catch {
    // The cache is optional. Cleanup must never hide the actual build result.
  }
}

async function stageModuleCache(dolly, replaceFile) {
  if (bootMode !== "rebuild" || configuredImage === "custom") return 0;
  const expected = imageDefinitions.get(configuredImage).moduleCaches;
  let layers;
  try {
    layers = await loadModuleLayers(
      DOLLY_BUILD_ID,
      expected.map(({ cacheKey }) => cacheKey),
    );
  } catch {
    return 0;
  }
  if (layers.length === 0) return 0;
  const directory = "/etc/dolly/module-cache-input";
  try {
    dolly.FS.mkdirTree(directory);
  } catch {
    return 0;
  }
  let staged = 0;
  for (const layer of layers) {
    const path = `${directory}/${layer.cacheKey}.layer`;
    try {
      if (await sha256(layer.bytes) !== layer.sha256) continue;
      replaceFile(path, new Uint8Array(layer.bytes));
      staged += 1;
    } catch {
      removeCacheTree(dolly, path);
    }
  }
  if (staged === 0) removeCacheTree(dolly, directory);
  return staged;
}

async function publishModuleCache(dolly) {
  if (bootMode !== "rebuild" || configuredImage === "custom") return 0;
  const expected = new Set(
    imageDefinitions.get(configuredImage).moduleCaches.map(({ cacheKey }) => cacheKey),
  );
  const directory = "/etc/dolly/module-cache-output";
  let names;
  try {
    names = dolly.FS.readdir(directory);
  } catch {
    return 0;
  }
  const layers = [];
  let total = 0;
  for (const name of names) {
    const match = /^([0-9a-f]{64})\.layer$/.exec(name);
    if (!match || !expected.has(match[1])) continue;
    const path = `${directory}/${name}`;
    try {
      const size = dolly.FS.stat(path).size;
      if (!Number.isSafeInteger(size) || size < 16 ||
          size > moduleCacheBytesLimit - total) continue;
      const source = dolly.FS.readFile(path);
      if (source.byteLength !== size) continue;
      const bytes = new Uint8Array(source.byteLength);
      bytes.set(source);
      layers.push({ cacheKey: match[1], sha256: await sha256(bytes), bytes: bytes.buffer });
      total += bytes.byteLength;
    } catch {
      // Ignore a malformed or unreadable optional cache layer.
    }
  }
  removeCacheTree(dolly, directory);
  if (layers.length === 0) return 0;
  try {
    const allowedCacheKeys = DOLLY_IMAGES.flatMap(
      ({ moduleCaches }) => moduleCaches.map(({ cacheKey }) => cacheKey),
    );
    await saveModuleLayers(DOLLY_BUILD_ID, layers, allowedCacheKeys);
    return layers.length;
  } catch {
    return 0;
  }
}

function removeStagedModuleCache(dolly) {
  removeCacheTree(dolly, "/etc/dolly/module-cache-input");
}

function expectedRecipes(image) {
  return imageDefinitions.get(image).recipes;
}

function validSnapshotPath(path) {
  return typeof path === "string" && path.startsWith("/") && path.length > 1 &&
    path.length <= 4096 && !path.includes("\\") && !path.includes("\0") &&
    !path.includes("//") &&
    !path.split("/").some((part) => part === "." || part === "..") &&
    !["/tmp", "/workspace", "/home/dolly/.pi/agent/auth.json", "/home/dolly/.pi/agent/sessions"]
      .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

async function verifyVisibleRecipes(recipes) {
  for (const recipe of recipes) {
    const response = await fetch(new URL(recipe.sourcePath.slice(1), applicationBase), {
      cache: "no-store", credentials: "same-origin", redirect: "error",
    });
    if (!response.ok) throw new Error(`${recipe.sourcePath} returned HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== recipe.byteLength || await sha256(bytes) !== recipe.sha256) {
      throw new Error(`${recipe.sourcePath} does not match the packaged snapshot recipe`);
    }
  }
}

function expectedModules(image) {
  return imageDefinitions.get(image).modules;
}

async function loadPackagedSnapshotMetadata(image) {
  const metadataUrl = new URL(
    `dist/dolly-${image}-system-snapshot.mjs`, applicationBase,
  );
  let metadata;
  try {
    ({ DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(metadataUrl.href));
  } catch {
    throw new Error("The packaged system snapshot is missing. Run npm run snapshot first.");
  }
  const recipes = expectedRecipes(image);
  const modules = expectedModules(image);
  if (metadata === null || typeof metadata !== "object" ||
      metadata.image !== image || metadata.buildId !== DOLLY_BUILD_ID ||
      metadata.formatVersion !== 1 || metadata.identityVersion !== 2 ||
      JSON.stringify(metadata.recipes) !== JSON.stringify(recipes) ||
      JSON.stringify(metadata.modules) !== JSON.stringify(modules) ||
      !Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0 ||
      metadata.byteLength > snapshotSizeLimit ||
      !/^[0-9a-f]{64}$/.test(metadata.sha256) ||
      !Array.isArray(metadata.manifest) || metadata.manifest.length === 0 ||
      metadata.manifest.length > 100_000) {
    throw new Error("The packaged system snapshot metadata does not match this Dolly build");
  }
  let previous = "";
  let manifestBytes = 0;
  for (const path of metadata.manifest) {
    if (!validSnapshotPath(path) || path <= previous) {
      throw new Error("The packaged system snapshot has an invalid retained-path manifest");
    }
    previous = path;
    manifestBytes += encoder.encode(path).byteLength + 1;
  }
  if (manifestBytes > 8 * 1024 * 1024) {
    throw new Error("The packaged system snapshot manifest is too large");
  }
  for (const required of [
    "/etc/dolly/Dollyfile",
    "/etc/dolly/entry",
    "/etc/dolly/environment",
    "/etc/dolly/image",
    "/etc/dolly/recipes.lock",
  ]) {
    if (!metadata.manifest.includes(required)) {
      throw new Error(`The packaged system snapshot is missing ${required}`);
    }
  }
  await verifyVisibleRecipes(recipes);
  return metadata;
}

async function loadPackagedSystemSnapshot(image, metadata) {
  const artifactUrl = new URL(
    `dist/dolly-${image}-system.snapshot`, applicationBase,
  );
  let response;
  try {
    response = await fetch(artifactUrl, {
      cache: "no-store", credentials: "same-origin", redirect: "error",
    });
  } catch {
    throw new Error("The packaged system snapshot could not be loaded");
  }
  if (!response.ok) throw new Error(`The packaged system snapshot returned HTTP ${response.status}`);
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) !== metadata.byteLength) {
    throw new Error("The packaged system snapshot has the wrong HTTP content length");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== metadata.byteLength || await sha256(bytes) !== metadata.sha256) {
    throw new Error("The packaged system snapshot failed its integrity check");
  }
  return bytes;
}

function isStrictModulePrefix(candidate, target) {
  return candidate.length > 0 && candidate.length < target.length &&
    candidate.every((module, index) =>
      module.location === target[index].location &&
      module.sha256 === target[index].sha256);
}

async function findModuleCache() {
  const target = expectedModules(configuredImage);
  const candidates = [...imageDefinitions.values()]
    .filter((definition) => isStrictModulePrefix(definition.modules, target))
    .sort((left, right) => right.modules.length - left.modules.length);
  for (const candidate of candidates) {
    try {
      const metadata = await loadPackagedSnapshotMetadata(candidate.image);
      return { image: candidate.image, uses: candidate.modules.length, metadata };
    } catch {
      // A missing or stale prefix is only a cache miss. The cold rebuild path
      // remains authoritative and will produce a new verified snapshot.
    }
  }
  return null;
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
        error.errno = 14;
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
try {
  const snapshotMetadata = bootMode === "snapshot"
    ? await loadPackagedSnapshotMetadata(configuredImage)
    : null;
  const moduleCache = bootMode === "rebuild" && configuredImage !== "custom"
    ? await findModuleCache()
    : null;
  bootstrapStage("loading Dolly runtime...");
  const nativeTextDecoder = globalThis.TextDecoder;
  globalThis.TextDecoder = undefined;
  const { default: createDolly } = await import("../dist/dolly.mjs");
  bootstrapStage("creating shared wasm64 userspace...");
  const memory = createDollyMemory();
  const dollyOptions = {
    noInitialRun: true,
    wasmMemory: memory,
    locateFile: locateArtifact,
    bootstrapWriteBytes: (bytes) => self.postMessage({ type: "bootstrap-bytes", bytes }),
    httpDispatch: (request) => self.postMessage({ type: "http-request", ...request }),
    httpCancel: (sequence) => self.postMessage({ type: "http-cancel", sequence }),
    downloadDispatch: ({ name, bytes }) => {
      if (typeof name !== "string" || name.length === 0 || name.length > 255 ||
          /[\/\\\u0000-\u001f\u007f]/u.test(name) ||
          !(bytes instanceof Uint8Array) || bytes.byteLength > 64 * 1024 * 1024) {
        return -22;
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
  const stagedModuleLayers = await stageModuleCache(dolly, replaceFile);
  if (stagedModuleLayers !== 0) {
    bootstrapStage(`staged ${stagedModuleLayers} local module cache layers...`);
  }
  const restoreMetadata = snapshotMetadata ?? moduleCache?.metadata;
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
    memory: memory.buffer,
    httpAddress: Number(dolly._dolly_http_mailbox_address()),
    httpCapacity: dolly._dolly_http_chunk_capacity(),
    httpVersion: dolly._dolly_http_mailbox_version(),
  });
  await brokerReady;

  let bootstrapStatus;
  let snapshotBytes;
  if (bootMode === "rebuild") {
    bootstrapStage("building userspace from the Dollyfile...");
    if (moduleCache) {
      bootstrapStage(
        `using ${moduleCache.uses}-module ${moduleCache.image} prefix cache...`,
      );
      const snapshot = await loadPackagedSystemSnapshot(
        moduleCache.image, moduleCache.metadata,
      );
      const restoreAddress = dolly._dolly_snapshot_restore_address(
        BigInt(snapshot.byteLength),
      );
      const range = checkedMemoryRange(memory, restoreAddress, snapshot.byteLength);
      new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(snapshot));
      bootstrapStatus = dolly._dolly_bootstrap_resume(
        BigInt(range.size), moduleCache.uses,
      );
      } else {
        bootstrapStatus = dolly._dolly_bootstrap();
      }
      removeStagedModuleCache(dolly);
      if (bootstrapStatus === 0) {
        if (moduleCache) {
          bootstrapStage(
            `module cache reused ${moduleCache.uses} modules from ${moduleCache.image}`,
          );
        }
        if (dolly._dolly_snapshot_capture() !== 0) {
        throw new Error("Dolly system snapshot capture failed");
      }
      const range = checkedMemoryRange(
        memory, dolly._dolly_snapshot_address(), dolly._dolly_snapshot_size(),
      );
      const copy = new Uint8Array(range.size);
      copy.set(new Uint8Array(memory.buffer, range.address, range.size));
      snapshotBytes = range.size;
      self.postMessage({ type: "system-snapshot", bytes: copy.buffer }, [copy.buffer]);
        bootstrapStage("starting sandbox display...");
        bootstrapStatus = dolly._dolly_bootstrap_finish();
        if (bootstrapStatus === 0) {
          const savedModuleLayers = await publishModuleCache(dolly);
          if (savedModuleLayers !== 0) {
            bootstrapStage(`saved ${savedModuleLayers} local module cache layers`);
          }
        }
      }
      if (bootstrapStatus !== 0) {
        removeCacheTree(dolly, "/etc/dolly/module-cache-output");
      }
  } else {
    bootstrapStage("loading precompiled userspace snapshot...");
    const snapshot = await loadPackagedSystemSnapshot(configuredImage, snapshotMetadata);
    const restoreAddress = dolly._dolly_snapshot_restore_address(BigInt(snapshot.byteLength));
    const range = checkedMemoryRange(memory, restoreAddress, snapshot.byteLength);
    new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(snapshot));
    bootstrapStatus = dolly._dolly_bootstrap_snapshot(BigInt(range.size));
    snapshotBytes = range.size;
    if (bootstrapStatus === 0 && bootConfig.sessionSnapshot !== undefined) {
      bootstrapStage("restoring named session filesystem...");
      const sessionAddress = dolly._dolly_session_restore_address(
        BigInt(bootConfig.sessionSnapshot.byteLength),
      );
      const sessionRange = checkedMemoryRange(
        memory, sessionAddress, bootConfig.sessionSnapshot.byteLength,
      );
      new Uint8Array(memory.buffer, sessionRange.address, sessionRange.size)
        .set(new Uint8Array(bootConfig.sessionSnapshot));
      if (dolly._dolly_session_restore(BigInt(sessionRange.size)) !== 0) {
        throw new Error("Dolly session filesystem restore failed");
      }
      bootstrapStage("named session filesystem restored");
    }
  }
  if (bootstrapStatus !== 0) throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);

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
    httpAddress: Number(dolly._dolly_http_mailbox_address()),
    httpCapacity: dolly._dolly_http_chunk_capacity(),
    httpVersion: dolly._dolly_http_mailbox_version(),
  });
  await displayReady;

  const status = dolly._dolly_shell_run();
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
