// Generates C and JavaScript constants from the canonical contract sources.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { hostManifests } from "../host/manifests.mjs";
import { hostFiles } from "./host-modules.mjs";

const root = new URL("..", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
// Unchanged files keep their mtimes, so dependents do not rebuild.
const write = async (path, text) => {
  if (await read(path).catch(() => null) !== text) await writeFile(new URL(path, root), text);
};

// WAT contracts own their constants as exported i32 globals. A module whose
// contracts export any gets abi.mjs beside its manifest, and NAME-abi.h when the
// manifest lists it. The host record header is stringified into assembly and
// therefore keeps unsuffixed integers.
async function emitConstants(sources, module, header, suffix, digest) {
  const constants = [];
  for (const source of sources) constants.push(...(await read(source)).matchAll(
    /\(global \(export "(DOLLY_[A-Z0-9_]+)"\) i32 \(i32.const (\d+)\)\)/g));
  const c = constants.map(([, constant, value]) => `#define ${constant} ${value}${suffix}\n`);
  const js = constants.map(([, constant, value]) => `export const ${constant} = ${value};\n`);
  if (digest) {
    c.push(`#define ${digest.name} ${[...digest.bytes].map(byte => `0x${byte.toString(16).padStart(2, "0")}`).join(", ")}\n`);
    js.push(`export const ${digest.name} = "${digest.bytes.toString("hex")}";\n`);
  }
  if (!js.length) return;
  const origin = [...sources, ...digest?.sources ?? []].join(", ");
  if (header) await write(header, `/* Generated from ${origin}. */\n#pragma once\n${c.join("")}`);
  await write(module, `// Generated from ${origin}.\n${js.join("")}`);
}
await emitConstants(["abi/dolly-host-0.wat"], "host/abi.mjs", "include/dolly/host-abi.h", "");
// A module with NAME-abi.h also gets DOLLY_NAME_ABI_DIGEST, the SHA-256 of the
// exact bytes of its contracts and other headers. Its client records the digest
// in executables (abi/dolly-host-0.wat), so any edit to them changes identity.
for (const { name } of hostManifests) {
  const files = field => hostFiles(field).filter(entry => entry.name === name).map(entry => entry.file);
  const contracts = [...files("contracts"), ...files("process")];
  const header = files("headers").find(file => file.endsWith(`/${name}-abi.h`));
  let digest;
  if (header) {
    const sources = files("headers").filter(file => file !== header);
    const hash = createHash("sha256");
    for (const file of [...contracts, ...sources]) hash.update(await readFile(new URL(file, root)));
    digest = { name: `DOLLY_${name.toUpperCase().replaceAll("-", "_")}_ABI_DIGEST`, sources, bytes: hash.digest() };
  }
  await emitConstants(contracts, `host/${name}/abi.mjs`, header, "u", digest);
}

// The process packet contract is C. Its enumerators and defines are integer
// expressions over earlier constants; packet sizes come from its layout checks.
let errorNumbers;
const header = (await read("include/dolly/process.h"))
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\\\n/g, " ")
  .replace(/enum dolly_process_error \{([^}]*)\};/, (_, numbers) => (errorNumbers = numbers, ""));
const errors = [...errorNumbers.matchAll(/DOLLY_PROCESS_(E[A-Z0-9]+) = (\d+)/g)];
// The kernel and the libc adapter are compiled against the bootstrap libc:
// scripts/build.sh compiles this proof that its errno numbers are the contract's.
await write("build/process-errno-check.c", "#include <errno.h>\n#include <dolly/process.h>\n" +
  errors.map(([, name]) => `_Static_assert(${name} == DOLLY_PROCESS_${name}, "${name}");\n`).join(""));
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
  "export const DOLLY_ERRNO = Object.freeze({\n" +
  errors.map(([, name, value]) => `  ${name}: ${value},\n`).join("") + "});\n" +
  "export const DOLLY_PROCESS_SIZEOF = Object.freeze({\n" +
  sizes.map(([, type, size]) => `  ${type}: ${size},\n`).join("") + "});\n");
