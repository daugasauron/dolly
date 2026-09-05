import { readFile } from "node:fs/promises";
import { parseWasmInterface } from "../src/wasm-interface.mjs";
export * from "../src/wasm-interface.mjs";

export async function readWasmInterface(path) {
  return parseWasmInterface(await readFile(path), path);
}
