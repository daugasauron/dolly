// Generates C and JavaScript constants from the canonical contract sources.
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const write = (path, text) => writeFile(new URL(path, root), text);

// WAT contracts own their constants as exported i32 globals. The host header
// is stringified into assembly and therefore keeps unsuffixed integers.
for (const { name, header, module, suffix } of [
  { name: "threads", header: "include/dolly/threads-abi.h", module: "src/threads-abi.mjs", suffix: "u" },
  { name: "gpu", header: "include/dolly/gpu-abi.h", module: "src/gpu-abi.mjs", suffix: "u" },
  { name: "audio", header: "include/dolly/audio-abi.h", module: "src/audio-abi.mjs", suffix: "u" },
  { name: "host", header: "include/dolly/host-abi.h", module: "src/host/abi.mjs", suffix: "" },
  { name: "http", module: "src/host/http-abi.mjs" },
]) {
  const source = `abi/dolly-${name}-0.wat`;
  const constants = [...(await read(source)).matchAll(
    /\(global \(export "(DOLLY_[A-Z0-9_]+)"\) i32 \(i32.const (\d+)\)\)/g)];
  if (!constants.length) throw new Error(`${source} has no constants`);
  if (header) await write(header, `/* Generated from ${source}. */\n#pragma once\n` +
    constants.map(([, constant, value]) => `#define ${constant} ${value}${suffix}\n`).join(""));
  await write(module, `// Generated from ${source}.\n` +
    constants.map(([, constant, value]) => `export const ${constant} = ${value};\n`).join(""));
}

// The process packet contract is C. Its enumerators and defines are integer
// expressions over earlier constants; packet sizes come from its layout checks.
const header = (await read("include/dolly/process.h"))
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\\\n/g, " ");
const constants = new Map([["UINT32_MAX", 0xffffffff]]);
for (const [, name, expression] of header.matchAll(
  /^[ \t]*(?:#define[ \t]+)?(DOLLY_PROCESS_[A-Z0-9_]+)[ \t]*(?:=|[ \t])[ \t]*([^,\n]+?)[ \t]*,?[ \t]*$/gm)) {
  const arithmetic = expression
    .replace(/\b[A-Z][A-Z0-9_]+\b/g, symbol => {
      if (!constants.has(symbol)) throw new Error(`process.h: ${name} uses unknown ${symbol}`);
      return constants.get(symbol);
    })
    .replace(/\b(\d+)u\b/g, "$1");
  if (!/^[\d\s()*|<]+$/.test(arithmetic)) throw new Error(`process.h: unsupported ${name} = ${expression}`);
  constants.set(name, Function(`"use strict"; return (${arithmetic}) >>> 0;`)());
}
constants.delete("UINT32_MAX");
const sizes = [...header.matchAll(/DOLLY_PROCESS_LAYOUT\((dolly_process_\w+), (\d+)\);/g)];
if (!constants.has("DOLLY_PROCESS_PACKET_LIMIT") || !sizes.length) {
  throw new Error("process.h has no packet contract");
}
await write("src/process-constants.mjs", "// Generated from include/dolly/process.h.\n" +
  [...constants].map(([name, value]) => `export const ${name} = ${value};\n`).join("") +
  "export const DOLLY_PROCESS_SIZEOF = Object.freeze({\n" +
  sizes.map(([, type, size]) => `  ${type}: ${size},\n`).join("") + "});\n");
