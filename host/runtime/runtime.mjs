import { DOLLY_ERRNO } from "../../dist/dolly-errno.mjs";
import { DollyProcessSupervisor } from "../../src/process-supervisor.mjs";

export function check() {
  if (!globalThis.crossOriginIsolated) return "cross-origin isolation is required";
  try { new WebAssembly.Memory({ initial: 1n, maximum: 1n, shared: true, address: "i64" }); }
  catch { return "shared WebAssembly memory64 is unavailable"; }
  return null;
}

// Bootstrap text only feeds the page's 1 MiB log; one write never sends more.
const maxBootstrapMessage = 1024 * 1024;

export function worker({ send, applicationBase, abi, service }) {
  const memory = new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: "i64" });
  let supervisor, threadProvider;
  const text = value => `${String(value).slice(-maxBootstrapMessage)}\n`;
  return {
    memory,
    setThreadProvider(provider) {
      if (supervisor || threadProvider) throw new Error("thread provider already initialized");
      threadProvider = provider;
    },
    options: {
      wasmMemory: memory,
      bootstrapWriteBytes: bytes => send({ type: "bootstrap-bytes",
        bytes: bytes.length > maxBootstrapMessage ? bytes.slice(-maxBootstrapMessage) : bytes }),
      print: value => send({ type: "bootstrap", text: text(value) }),
      printErr: value => send({ type: "bootstrap", text: text(value), error: true }),
    },
    async supervisor(dolly) {
      return supervisor ??= await DollyProcessSupervisor.create(dolly, memory, applicationBase, abi, service, threadProvider);
    },
    serviceDeferred() { supervisor?.serviceDeferred(); },
    dispose() { supervisor?.dispose(); },
  };
}

export function installOutputDevices(dolly) {
  for (const [path, number] of [["/dev/dolly-stdout", 1], ["/dev/dolly-stderr", 2]]) {
    const device = dolly.FS.makedev(80, number);
    dolly.FS.registerDevice(device, {
      read() { return 0; },
      write(_stream, buffer, offset, length) {
        if (buffer.length - offset < length) {
          throw Object.assign(new Error("invalid WasmFS device write range"), { errno: DOLLY_ERRNO.EFAULT });
        }
        dolly._dolly_terminal_write_bytes(BigInt(buffer.byteOffset + offset), BigInt(length));
        return length;
      },
    });
    dolly.FS.mkdev(path, 0o222, device);
  }
}
