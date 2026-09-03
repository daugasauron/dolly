#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error("usage: patch-emscripten-loader.mjs RUNTIME.mjs");
  process.exit(64);
}

let source = await readFile(path, "utf8");
const oldDylinkView =
  "var int32View=new Uint32Array(new Uint8Array(binary.subarray(0,24)).buffer);" +
  "var magicNumberFound=int32View[0]==1836278016";
const newDylinkView =
  "var magicNumberFound=binary.length>=9&&binary[0]===0&&binary[1]===97&&" +
  "binary[2]===115&&binary[3]===109";
const dylinkViewMatches = source.split(oldDylinkView).length - 1;
if (dylinkViewMatches !== 1) {
  throw new Error(
    `expected exactly one Emscripten dylink metadata view, found ${dylinkViewMatches}`,
  );
}
source = source.replace(oldDylinkView, newDylinkView);

// Emscripten 6.0.8's synchronous dylinker reads `.value` from a missing
// symbol while constructing its diagnostic. Preserve the failure, but make it
// name the unresolved symbol instead of throwing an opaque JavaScript
// TypeError before the loader can report it.
const oldUndefinedSymbol =
  'else if(typeof value.value=="bigint"){entry.value=value}else{throw new Error(`bad export type';
const newUndefinedSymbol =
  'else if(value!=null&&typeof value.value=="bigint"){entry.value=value}else{throw new Error(`bad export type';
const undefinedSymbolMatches = source.split(oldUndefinedSymbol).length - 1;
if (undefinedSymbolMatches !== 1) {
  throw new Error(
    `expected exactly one Emscripten undefined-symbol diagnostic, found ${undefinedSymbolMatches}`,
  );
}
source = source.replace(oldUndefinedSymbol, newUndefinedSymbol);

await writeFile(path, source);
console.log("dolly: hardened the pinned Emscripten dynamic loader diagnostics");
