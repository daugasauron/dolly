import { sameWasmType } from "../wasm-interface.mjs";
import { DOLLY_THREADS_ABI_DIGEST } from "../../dist/dolly-threads-abi.mjs";

export const contract = Object.freeze({ name: "threads", version: 0, header: "dolly/threads.h",
  abi: ["dolly-threads-0", "dolly-threads-supervisor-0"], dependencies: ["runtime@0"], imports: [] });

export function validateThreadProfile(parsed, schema) {
  const stamps = parsed.customSectionData.filter(section => section.name === "dolly.threads");
  if (!stamps.length) return false;
  if (stamps.length !== 1 || [...stamps[0].data].map(x => x.toString(16).padStart(2, "0")).join("") !== DOLLY_THREADS_ABI_DIGEST)
    throw new TypeError("process has an incompatible dolly.threads stamp");
  const expected = schema.exports.find(entry => entry.name === "dolly_thread_start");
  const actual = parsed.exports.find(entry => entry.name === expected.name);
  if (!actual || !sameWasmType(actual.type, expected.type))
    throw new TypeError("threaded process needs dolly_thread_start(i32, i64) -> i64");
  return true;
}

export function worker({ get }) {
  // Trusted resource limits, independent of kernel bookkeeping or guest claims.
  // Retired threads retain their join result in Wasm, not a Worker or host slot.
  const workers = new Map();
  const provider = {
    available(pid) {
      return workers.size < 64 && [...workers.values()].filter(owner => owner === pid).length < 16;
    },
    create(pid, url, name) {
      if (!provider.available(pid)) return null;
      const worker = new Worker(url, { type: "module", name });
      workers.set(worker, pid);
      return worker;
    },
    release(worker) { worker.terminate(); workers.delete(worker); },
    dispose() { for (const worker of workers.keys()) worker.terminate(); workers.clear(); },
  };
  get("runtime").setThreadProvider(provider);
  return provider;
}
