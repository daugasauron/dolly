#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error("usage: patch-emscripten-loader.mjs RUNTIME.mjs");
  process.exit(64);
}

const source = await readFile(path, "utf8");
const oldCode =
  "var int32View=new Uint32Array(new Uint8Array(binary.subarray(0,24)).buffer);" +
  "var magicNumberFound=int32View[0]==1836278016";
const newCode =
  "var magicNumberFound=binary.length>=9&&binary[0]===0&&binary[1]===97&&" +
  "binary[2]===115&&binary[3]===109";
const matches = source.split(oldCode).length - 1;
if (matches !== 1) {
  throw new Error(
    `expected exactly one Emscripten dylink metadata view, found ${matches}`,
  );
}
await writeFile(path, source.replace(oldCode, newCode));
console.log("dolly: made Emscripten dylink magic validation view-safe");
