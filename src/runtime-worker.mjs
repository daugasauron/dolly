import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";

const bootMode = new URL(self.location.href).searchParams.get("boot") === "rebuild"
  ? "rebuild"
  : "snapshot";
const snapshotSizeLimit = 512 * 1024 * 1024;
const snapshotArtifactUrl = new URL("../dist/dolly-system.snapshot", import.meta.url);
const snapshotMetadataUrl = new URL("../dist/dolly-system-snapshot.mjs", import.meta.url);

function locateArtifact(path) {
  return new URL(`../dist/${path.split("/").at(-1)}`, import.meta.url).href;
}

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadPackagedSystemSnapshot() {
  let metadata;
  try {
    ({ DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(snapshotMetadataUrl.href));
  } catch {
    throw new Error(
      "The packaged system snapshot is missing. Run npm run snapshot before serving Dolly.",
    );
  }
  if (metadata === null || typeof metadata !== "object" ||
      metadata.buildId !== DOLLY_BUILD_ID || metadata.formatVersion !== 1 ||
      !Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0 ||
      metadata.byteLength > snapshotSizeLimit ||
      !/^[0-9a-f]{64}$/.test(metadata.sha256)) {
    throw new Error("The packaged system snapshot metadata does not match this Dolly build");
  }

  let response;
  try {
    response = await fetch(snapshotArtifactUrl, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
  } catch {
    throw new Error("The packaged system snapshot could not be loaded");
  }
  if (!response.ok) {
    throw new Error(`The packaged system snapshot returned HTTP ${response.status}`);
  }
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 ||
        contentLength !== metadata.byteLength) {
      throw new Error("The packaged system snapshot has the wrong HTTP content length");
    }
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== metadata.byteLength) {
    throw new Error("The packaged system snapshot has the wrong byte length");
  }
  const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (digest !== metadata.sha256) {
    throw new Error("The packaged system snapshot failed its SHA-256 check");
  }
  return bytes;
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

function installOutputDevice(dolly, path, deviceNumber) {
  const device = dolly.FS.makedev(80, deviceNumber);
  dolly.FS.registerDevice(device, {
    read() {
      return 0;
    },
    write(_stream, buffer, offset, length) {
      if (buffer.length - offset < length) {
        self.postMessage({
          type: "bootstrap",
          text: `dolly: rejected invalid WasmFS device write: device=${deviceNumber} view=${buffer.length} offset=${offset} length=${length}\n`,
          error: true,
        });
        const error = new Error("invalid WasmFS device write range");
        error.errno = 14;
        throw error;
      }
      const address = buffer.byteOffset + offset;
      dolly._dolly_terminal_write_bytes(BigInt(address), BigInt(length));
      return length;
    },
  });
  dolly.FS.mkdev(path, 0o222, device);
}

try {
  // The generated loader was deliberately linked without Emscripten's shared-
  // memory runtime. Its optional TextDecoder fast path rejects SharedArrayBuffer
  // views, while its built-in UTF-8 decoder is safe. Keep that fast path off in
  // this isolated worker; Dolly still supplies the memory explicitly below.
  const nativeTextDecoder = globalThis.TextDecoder;
  globalThis.TextDecoder = undefined;
  const { default: createDolly } = await import("../dist/dolly.mjs");
  const memory = new WebAssembly.Memory({
    initial: 1024n,
    maximum: 131072n,
    shared: true,
    address: "i64",
  });
  const dolly = await createDolly({
    noInitialRun: true,
    wasmMemory: memory,
    locateFile: locateArtifact,
    bootstrapWriteBytes: (bytes) => self.postMessage({ type: "bootstrap-bytes", bytes }),
    httpDispatch: (request) => self.postMessage({ type: "http-request", ...request }),
    print: (text) => bootstrapOutput(`${text}\n`),
    printErr: (text) => bootstrapOutput(`${text}\n`, true),
  });
  globalThis.TextDecoder = nativeTextDecoder;

  dolly.FS.mkdirTree("/dev");
  installOutputDevice(dolly, "/dev/dolly-stdout", 1);
  installOutputDevice(dolly, "/dev/dolly-stderr", 2);

  let bootstrapStatus;
  let snapshotBytes;
  if (bootMode === "rebuild") {
    bootstrapStatus = dolly._dolly_bootstrap();
    if (bootstrapStatus === 0) {
      const captureStatus = dolly._dolly_snapshot_capture();
      if (captureStatus !== 0) {
        throw new Error(`Dolly system snapshot capture failed with status ${captureStatus}`);
      }
      const range = checkedMemoryRange(
        memory,
        dolly._dolly_snapshot_address(),
        dolly._dolly_snapshot_size(),
      );
      const copy = new Uint8Array(range.size);
      copy.set(new Uint8Array(memory.buffer, range.address, range.size));
      snapshotBytes = range.size;
      bootstrapOutput(`dolly: captured ${range.size} byte precompiled system snapshot\n`);
      self.postMessage(
        { type: "system-snapshot", bytes: copy.buffer },
        [copy.buffer],
      );
    }
  } else {
    const snapshot = await loadPackagedSystemSnapshot();
    const restoreAddress = dolly._dolly_snapshot_restore_address(
      BigInt(snapshot.byteLength),
    );
    const range = checkedMemoryRange(memory, restoreAddress, snapshot.byteLength);
    new Uint8Array(memory.buffer, range.address, range.size)
      .set(new Uint8Array(snapshot));
    bootstrapStatus = dolly._dolly_bootstrap_snapshot(BigInt(range.size));
    snapshotBytes = range.size;
  }
  if (bootstrapStatus !== 0) {
    throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);
  }

  self.postMessage({
    type: "ready",
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
    httpAddress: Number(dolly._dolly_http_mailbox_address()),
    httpCapacity: dolly._dolly_http_chunk_capacity(),
    httpVersion: dolly._dolly_http_mailbox_version(),
  });

  const status = dolly._dolly_shell_run();
  self.postMessage({ type: "exited", status });
} catch (error) {
  self.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? "" : "",
  });
}
