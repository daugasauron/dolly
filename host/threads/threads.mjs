import { parseWasmInterface, sameWasmType } from "../../src/wasm-interface.mjs";
import { DOLLY_THREAD_EXIT, DOLLY_THREAD_SPAWN } from "./abi.mjs";
export { DOLLY_THREADS_ABI_DIGEST as digest } from "./abi.mjs";

// The supervisor runs a process on several Workers through this provider
// (runtime.mjs setThreadProvider): which executables are threaded, the
// operations that start and end a thread, the kernel's thread bookkeeping
// (dolly-threads-supervisor-0.wat) and the Workers themselves.
export function worker({ get, runtimeBase }) {
  let kernel, schema;
  // Trusted resource limits, independent of kernel bookkeeping or guest claims.
  // Retired threads retain their join result in Wasm, not a Worker or host slot.
  const workers = new Map();
  const provider = {
    async start(context) {
      ({ kernel } = context);
      const response = await fetch(new URL("dist/dolly-threads-0.wasm", runtimeBase),
        { cache: "no-store", credentials: "same-origin", redirect: "error" });
      if (!response.ok) throw new Error(`Dolly dolly-threads-0.wasm returned HTTP ${response.status}`);
      schema = parseWasmInterface(await response.arrayBuffer(), "dolly-threads-0");
    },
    // An executable that links the threads client (every -pthread program) is
    // threaded; its requirement's digest is checked with the others.
    threaded(parsed, requirements) {
      if (!requirements.has("threads@0")) return false;
      const expected = schema.exports.find(entry => entry.name === "dolly_thread_start");
      const actual = parsed.exports.find(entry => entry.name === expected.name);
      if (!actual || !sameWasmType(actual.type, expected.type))
        throw new TypeError("a program using threads@0 must export dolly_thread_start(i32, i64) -> i64; build C and C++ with -pthread");
      return true;
    },
    operations: { spawn: DOLLY_THREAD_SPAWN, exit: DOLLY_THREAD_EXIT },
    attach: pid => kernel.dolly_threads_attach(pid),
    // Through the generic call path, as the supervisor calls dispatch: Firefox
    // can enter a direct Wasm call twice.
    dispatch: request => Reflect.apply(kernel.dolly_threads_dispatch, kernel, request),
    unstarted: (pid, tid) => kernel.dolly_threads_unstarted(pid, tid),
    retired: (pid, tid, result) => kernel.dolly_threads_retired(pid, tid, result),
    available(pid) {
      return workers.size < 64 && [...workers.values()].filter(owner => owner === pid).length < 32;
    },
    create(pid, url, name) {
      if (!provider.available(pid)) return null;
      const worker = new Worker(url, { type: "module", name });
      workers.set(worker, pid);
      return worker;
    },
    // A Worker the supervisor leaves to end itself is not terminated.
    release(worker, terminate = true) { if (terminate) worker.terminate(); workers.delete(worker); },
    dispose() { for (const worker of workers.keys()) worker.terminate(); workers.clear(); },
    // The runtime goes on without the module: the programs on its Workers end.
    disabled() { get("runtime").setThreadProvider(undefined); },
  };
  get("runtime").setThreadProvider(provider);
  return provider;
}
