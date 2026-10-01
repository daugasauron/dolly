import { readFile } from "node:fs/promises";
import vm from "node:vm";
const [runtime, janis] = await Promise.all(["dolly-node.js", "janis.js"].map(name =>
  readFile(new URL(`../../${name}`, import.meta.url), "utf8")));

export function janisContext(overrides = {}) {
  // Globals that QuickJS-ng or quickjs-main.c provide before Janis loads.
  const sandbox = vm.createContext({
    ArrayBuffer, SharedArrayBuffer, Uint8Array, atob, btoa, console, DOMException,
    performance, queueMicrotask,
    Dolly: {
      encode: value => new TextEncoder().encode(value),
      decode: bytes => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
      terminalSize: () => ({ columns: 80, rows: 24 }), getenv: () => undefined, isatty: () => false,
      cwd: () => "/workspace", chdir() {}, fsAccess() { throw new Error("ENOENT"); }, cloneValue: structuredClone,
      ...overrides,
    },
  });
  vm.runInContext(runtime, sandbox);
  vm.runInContext(janis, sandbox);
  return sandbox;
}
