import { parseWasmInterface, sameWasmType } from "../../page/wasm-interface.mjs";
import { DOLLY_THREAD_EXIT, DOLLY_THREAD_SPAWN } from "./abi.mjs";
export { DOLLY_THREADS_ABI_DIGEST as digest } from "./abi.mjs";

// The Workers threads may hold: trusted limits of this host, independent of the
// kernel's table (64 a process) or guest claims; the manifest's `gives` says them.
// Retired threads retain their join result in Wasm, not a Worker or host slot.
const workerLimit = 64, processWorkerLimit = 32;
// The export every thread but a process's first starts at.
const entry = "dolly_thread_start";

// The supervisor runs a process on several Workers through this provider
// (runtime.mjs setThreadProvider): which executables are threaded, the
// operations that start and end a thread and its entry, the kernel's thread
// bookkeeping (dolly-threads-supervisor-0.wat) and the Workers themselves.
export function worker({ get, runtimeBase }) {
  let kernel, schema;
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
      const expected = schema.exports.find(({ name }) => name === entry);
      const actual = parsed.exports.find(({ name }) => name === entry);
      if (!actual || !sameWasmType(actual.type, expected.type))
        throw new TypeError(`a program using threads@0 must export ${entry}(i32, i64) -> i64; build C and C++ with -pthread`);
      return true;
    },
    operations: { spawn: DOLLY_THREAD_SPAWN, exit: DOLLY_THREAD_EXIT },
    entry,
    attach: pid => kernel.dolly_threads_attach(pid),
    // Through the generic call path, as the supervisor calls dispatch: Firefox
    // can enter a direct Wasm call twice.
    dispatch: request => Reflect.apply(kernel.dolly_threads_dispatch, kernel, request),
    unstarted: (pid, tid) => kernel.dolly_threads_unstarted(pid, tid),
    retired: (pid, tid, result) => kernel.dolly_threads_retired(pid, tid, result),
    available(pid) {
      return workers.size < workerLimit && [...workers.values()].filter(owner => owner === pid).length < processWorkerLimit;
    },
    // The page makes it, as a process's (runtime.mjs pageWorkers): Firefox 159's new
    // Worker() here waited for good while the Workers it had made for threads ended
    // (tasks/20261117-122407-godot-firefox-start).
    create(pid, url, name) {
      if (!provider.available(pid)) return null;
      const worker = get("runtime").pageWorker(url, { type: "module", name });
      workers.set(worker, pid);
      return worker;
    },
    // A Worker the supervisor leaves to end itself says so, and is terminated then.
    release(worker, terminate = true) {
      if (terminate) worker.terminate();
      else worker.addEventListener("message", () => worker.terminate(), { once: true });
      workers.delete(worker);
    },
    dispose() { for (const worker of workers.keys()) worker.terminate(); workers.clear(); },
    // The runtime goes on without the module: the programs on its Workers end.
    disabled() { get("runtime").setThreadProvider(undefined); },
  };
  get("runtime").setThreadProvider(provider);
  return provider;
}
