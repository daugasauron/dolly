import { readFile } from "node:fs/promises";
import vm from "node:vm";
const [runtime, janis] = await Promise.all(["dolly-node.js", "janis.js"].map(name =>
  readFile(new URL(`../../src/runtimes/${name}`, import.meta.url), "utf8")));

export function janisContext(overrides = {}) {
  const sandbox = vm.createContext({
    ArrayBuffer, SharedArrayBuffer, Uint8Array, console,
    Dolly: {
      encode: value => new TextEncoder().encode(value),
      decode: bytes => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
      terminalSize: () => ({ columns: 80, rows: 24 }), getenv: () => undefined, isatty: () => false,
      cwd: () => "/workspace", chdir() {}, fsAccess() { throw new Error("ENOENT"); },
      ...overrides,
    },
  });
  vm.runInContext(runtime, sandbox);
  vm.runInContext(janis, sandbox);
  return sandbox;
}
