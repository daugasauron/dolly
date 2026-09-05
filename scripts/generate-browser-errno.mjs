import { readFile, rename, rm, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: generate-browser-errno INPUT.i OUTPUT.mjs");
const lines = (await readFile(input, "utf8")).split("\n")
  .filter(line => line.startsWith("DOLLY_ERRNO_VALUE("));
if (lines.length === 0) throw new Error("target preprocessor emitted no error constants");
const values = new Map();
for (const line of lines) {
  const match = /^DOLLY_ERRNO_VALUE\("(E[A-Z0-9]+)",\s*\(*(\d+)\)*\)$/.exec(line);
  if (!match || values.has(match[1]) || Number(match[2]) > 0x7fffffff) {
    throw new Error(`invalid target error constant: ${line}`);
  }
  values.set(match[1], Number(match[2]));
}
const source = "// Generated from the pinned target's <errno.h>. Do not edit.\n" +
  "export const DOLLY_ERRNO = Object.freeze({\n" +
  [...values].map(([name, value]) => `  ${name}: ${value},\n`).join("") + "});\n";
const temporary = `${output}.${process.pid}.tmp`;
try {
  await writeFile(temporary, source);
  await rename(temporary, output);
} finally { await rm(temporary, { force: true }); }
