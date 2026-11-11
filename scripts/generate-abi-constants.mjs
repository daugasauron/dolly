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

// The process packet contract is C. Its enumerators and defines are integer
// expressions over earlier constants; packet sizes come from its layout checks.
let errorNumbers;
const header = (await read("include/dolly/process.h"))
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\\\n/g, " ")
  .replace(/enum dolly_process_error \{([^}]*)\};/, (_, numbers) => (errorNumbers = numbers, ""));
const errors = [...errorNumbers.matchAll(/DOLLY_PROCESS_(E[A-Z0-9]+) = (\d+)/g)];
// The value of a C integer expression over the constants known so far.
function integer(expression, name, constants, source) {
  const arithmetic = expression
    .replace(/\b[A-Z][A-Z0-9_]+\b/g, symbol => {
      if (!constants.has(symbol)) throw new Error(`${source}: ${name} uses unknown ${symbol}`);
      return constants.get(symbol);
    })
    .replace(/\b(\d+)u\b/g, "$1");
  if (!/^[\d\s()*|<]+$/.test(arithmetic)) throw new Error(`${source}: unsupported ${name} = ${expression}`);
  return Function(`"use strict"; return (${arithmetic}) >>> 0;`)();
}

// WAT contracts own their constants as exported i32 globals. A module whose
// contracts export any gets abi.mjs beside its manifest, and NAME-abi.h when the
// manifest lists it. The host record header is stringified into assembly and
// therefore keeps unsuffixed integers.
const constantDefines = async (sources, suffix) => (await Promise.all(sources.map(read))).flatMap(text =>
  [...text.matchAll(/\(global \(export "(DOLLY_[A-Z0-9_]+)"\) i32 \(i32.const (\d+)\)\)/g)])
  .map(([, constant, value]) => [constant, value, `#define ${constant} ${value}${suffix}\n`]);
async function emitConstants(sources, module, header, suffix, digest, errno = false, enumerated = []) {
  const constants = await constantDefines(sources, suffix);
  const c = constants.map(([, , define]) => define);
  const js = [...constants, ...enumerated].map(([constant, value]) => `export const ${constant} = ${value};\n`);
  // A module answers its calls with the process contract's errno numbers, as its C
  // includes <dolly/process.h>: its JavaScript then imports nothing of the runtime's.
  if (errno && js.length) js.push(`export const DOLLY_ERRNO = Object.freeze({ ${errors.map(([, name, value]) => `${name}: ${value}`).join(", ")} });\n`);
  if (digest) {
    c.push(`#define ${digest.name} ${[...digest.bytes].map(byte => `0x${byte.toString(16).padStart(2, "0")}`).join(", ")}\n`);
    js.push(`export const ${digest.name} = "${digest.bytes.toString("hex")}";\n`);
  }
  if (!js.length) return;
  const origin = [...sources, ...digest?.sources ?? []].join(", ");
  if (header) await write(header, `/* Generated from ${origin}. */\n#pragma once\n${c.join("")}`);
  await write(module, `// Generated from ${origin}${errno ? ", include/dolly/process.h" : ""}.\n${js.join("")}`);
}
await emitConstants(["abi/dolly-host-0.wat"], "host/abi.mjs", "include/dolly/host-abi.h", "");
// A module with NAME-abi.h also gets DOLLY_NAME_ABI_DIGEST, the SHA-256 of what
// an executable compiles against: the exact bytes of its process WAT and other
// headers, and the constants its kernel-boundary contracts give NAME-abi.h. Its
// client records the digest in executables (abi/dolly-host-0.wat), so any edit to
// them changes identity. The rest of those contracts is between the kernel and
// the host, which ship together: an edit there leaves executables as they were.
// What the headers in a module's own directory enumerate a host reads too, as
// http@0's request flags: abi.mjs carries them, the header holds them for C.
async function headerEnumerators(headers) {
  const known = new Map(), found = [];
  for (const file of headers) {
    const text = (await read(file)).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const [, body] of text.matchAll(/\benum\s*\w*\s*\{([^}]*)\}/g)) {
      for (const [, name, expression] of body.matchAll(/\b(DOLLY_[A-Z0-9_]+)\s*=\s*([^,]+?)\s*(?:,|$)/g)) {
        known.set(name, integer(expression, name, known, file));
        found.push([name, known.get(name)]);
      }
    }
  }
  return found;
}
for (const { name } of hostManifests) {
  const files = field => hostFiles(field).filter(entry => entry.name === name).map(entry => entry.file);
  const contracts = [...files("contracts"), ...files("process")];
  const header = files("headers").find(file => file.endsWith(`/${name}-abi.h`));
  let digest;
  if (header) {
    const sources = files("headers").filter(file => file !== header);
    const hash = createHash("sha256");
    for (const file of [...files("process"), ...sources]) hash.update(await readFile(new URL(file, root)));
    for (const [, , define] of await constantDefines(files("contracts"), "u")) hash.update(define);
    digest = { name: `DOLLY_${name.toUpperCase().replaceAll("-", "_")}_ABI_DIGEST`, sources, bytes: hash.digest() };
  }
  const enumerated = await headerEnumerators(files("headers").filter(file => file !== header && file.startsWith(`host/${name}/`)));
  await emitConstants(contracts, `host/${name}/abi.mjs`, header, "u", digest, true, enumerated);
}

// Each packet struct's size and field offsets, laid out as C lays out its
// fixed-width fields: each at a multiple of its alignment, the struct padded to
// its largest. scripts/build.sh compiles the proof that the compiler agrees.
const layouts = new Map(["uint16_t", "uint32_t", "uint64_t", "int64_t"].map(type => {
  const size = Number(type.match(/\d+/)[0]) / 8;
  return [type, { size, alignment: size }];
}));
for (const [, body, type] of header.matchAll(/typedef struct \{([^}]*)\}\s*(dolly_process_\w+);/g)) {
  const offsets = {};
  let size = 0, alignment = 1;
  for (const field of body.split(";").map(text => text.trim()).filter(Boolean)) {
    const [, member, name, count = 1] = field.match(/^(\w+)\s+(\w+)(?:\[(\d+)\])?$/) ??
      (() => { throw new Error(`process.h: ${type}: unsupported field ${field}`); })();
    const layout = layouts.get(member) ?? (() => { throw new Error(`process.h: ${type}: unknown type ${member}`); })();
    size = Math.ceil(size / layout.alignment) * layout.alignment;
    offsets[name] = size;
    size += layout.size * Number(count);
    alignment = Math.max(alignment, layout.alignment);
  }
  layouts.set(type, { size: Math.ceil(size / alignment) * alignment, alignment, offsets });
}
const packets = [...layouts].filter(([, layout]) => layout.offsets);
if (!packets.length) throw new Error("process.h has no packet structs");

// The kernel and the libc adapter are compiled against the bootstrap libc:
// scripts/build.sh compiles this proof that its errno numbers and the packet
// layouts are the contract's.
await write("build/process-abi-check.c", "#include <errno.h>\n#include <dolly/process.h>\n" +
  errors.map(([, name]) => `_Static_assert(${name} == DOLLY_PROCESS_${name}, "${name}");\n`).join("") +
  packets.map(([type, { size, offsets }]) => `_Static_assert(sizeof(${type}) == ${size}, "${type}");\n` +
    Object.entries(offsets).map(([field, offset]) =>
      `_Static_assert(offsetof(${type}, ${field}) == ${offset}, "${type}.${field}");\n`).join("")).join(""));
const constants = new Map([["UINT32_MAX", 0xffffffff]]);
for (const [, name, expression] of header.matchAll(
  /^[ \t]*(?:#define[ \t]+)?(DOLLY_PROCESS_[A-Z0-9_]+)[ \t]*(?:=|[ \t])[ \t]*([^,\n]+?)[ \t]*,?[ \t]*$/gm)) {
  constants.set(name, integer(expression, name, constants, "process.h"));
}
constants.delete("UINT32_MAX");
if (!constants.has("DOLLY_PROCESS_PACKET_LIMIT")) throw new Error("process.h has no packet contract");
await write("src/process-constants.mjs", "// Generated from include/dolly/process.h.\n" +
  [...constants].map(([name, value]) => `export const ${name} = ${value};\n`).join("") +
  "export const DOLLY_ERRNO = Object.freeze({\n" +
  errors.map(([, name, value]) => `  ${name}: ${value},\n`).join("") + "});\n" +
  "export const DOLLY_PROCESS_SIZEOF = Object.freeze({\n" +
  packets.map(([type, { size }]) => `  ${type}: ${size},\n`).join("") + "});\n" +
  "export const DOLLY_PROCESS_OFFSETOF = Object.freeze({\n" +
  packets.map(([type, { offsets }]) => `  ${type}: Object.freeze(${JSON.stringify(offsets).replaceAll(",", ", ")}),\n`).join("") +
  "});\n");
