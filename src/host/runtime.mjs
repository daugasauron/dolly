import { DOLLY_ERRNO } from "../../dist/dolly-errno.mjs";
import { DollyProcessSupervisor } from "../process-supervisor.mjs";

export const contract = Object.freeze({ name: "runtime", version: 0, header: "dolly/runtime.h",
  abi: ["dolly-process-0", "dolly-supervisor-0", "dolly-process-gate-0", "dolly-process-dso-0"],
  dependencies: [], imports: [
    "env.memory",
    "env._abort_js",
    "env.emscripten_resize_heap",
    "wasi_snapshot_preview1.clock_res_get",
    "wasi_snapshot_preview1.clock_time_get",
    "env._wasmfs_copy_preloaded_file_data",
    "env._wasmfs_get_num_preloaded_dirs",
    "env._wasmfs_get_num_preloaded_files",
    "env._wasmfs_get_preloaded_child_path",
    "env._wasmfs_get_preloaded_file_mode",
    "env._wasmfs_get_preloaded_file_size",
    "env._wasmfs_get_preloaded_parent_path",
    "env._wasmfs_get_preloaded_path_name",
    "env.emscripten_date_now",
    "wasi_snapshot_preview1.environ_get",
    "wasi_snapshot_preview1.environ_sizes_get",
    "wasi_snapshot_preview1.random_get",
    "env.dolly_bootstrap_write_bytes",
    "env._wasmfs_jsimpl_alloc_file",
    "env._wasmfs_jsimpl_free_file",
    "env._wasmfs_jsimpl_get_size",
    "env._wasmfs_jsimpl_read",
    "env._wasmfs_jsimpl_set_size",
    "env._wasmfs_jsimpl_write",
    "env.emscripten_err",
    "env.emscripten_out"
] });

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
