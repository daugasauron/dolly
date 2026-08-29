function locateArtifact(path) {
  return new URL(`../dist/${path.split("/").at(-1)}`, import.meta.url).href;
}

function output(text, error = false) {
  self.postMessage({ type: "output", text, error });
}

function installOutputDevice(dolly, path, deviceNumber) {
  const device = dolly.FS.makedev(80, deviceNumber);
  dolly.FS.registerDevice(device, {
    read() {
      return 0;
    },
    write(_stream, buffer, offset, length) {
      const bytes = new Uint8Array(length);
      bytes.set(buffer.subarray(offset, offset + length));
      self.postMessage({ type: "output-bytes", bytes });
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
    terminalWrite: (text) => output(text),
    terminalWriteBytes: (bytes) => self.postMessage({ type: "output-bytes", bytes }),
    httpDispatch: (request) => self.postMessage({ type: "http-request", ...request }),
    print: (text) => output(`${text}\r\n`),
    printErr: (text) => output(`${text}\r\n`, true),
  });
  globalThis.TextDecoder = nativeTextDecoder;

  dolly.FS.mkdirTree("/dev");
  installOutputDevice(dolly, "/dev/dolly-stdout", 1);
  installOutputDevice(dolly, "/dev/dolly-stderr", 2);

  const bootstrapStatus = dolly._dolly_bootstrap();
  if (bootstrapStatus !== 0) {
    throw new Error(`Dolly bootstrap failed with status ${bootstrapStatus}`);
  }

  self.postMessage({
    type: "ready",
    memory: memory.buffer,
    address: Number(dolly._dolly_terminal_mailbox_address()),
    capacity: dolly._dolly_terminal_input_capacity(),
    version: dolly._dolly_terminal_mailbox_version(),
    httpAddress: Number(dolly._dolly_http_mailbox_address()),
    httpCapacity: dolly._dolly_http_chunk_capacity(),
    httpVersion: dolly._dolly_http_mailbox_version(),
  });

  const status = dolly._dolly_shell_run();
  self.postMessage({ type: "exited", status });
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  self.postMessage({ type: "error", message });
}
