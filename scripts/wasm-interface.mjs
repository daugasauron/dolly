import { readFile } from "node:fs/promises";
import { parseWasmInterface } from "../page/wasm-interface.mjs";
export * from "../page/wasm-interface.mjs";

export async function readWasmInterface(path) {
  return parseWasmInterface(await readFile(path), path);
}
