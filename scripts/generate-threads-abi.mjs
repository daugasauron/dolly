import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { appendCustomSection } from "../src/wasm-interface.mjs";

const source = await readFile(new URL("../abi/dolly-threads-0.wat", import.meta.url), "utf8");
const constants = [...source.matchAll(/\(global \(export "(DOLLY_THREAD_[A-Z_]+)"\) i32 \(i32.const (\d+)\)\)/g)];
if (!constants.length) throw new Error("thread contract has no constants");
await writeFile(new URL("../include/dolly/threads-abi.h", import.meta.url),
  "/* Generated from abi/dolly-threads-0.wat. */\n#pragma once\n" +
  constants.map(([, name, value]) => `#define ${name} ${value}u\n`).join(""));
await writeFile(new URL("../src/threads-abi.mjs", import.meta.url),
  "// Generated from abi/dolly-threads-0.wat.\n" +
  constants.map(([, name, value]) => `export const ${name} = ${value};\n`).join(""));
if (process.argv[2]) {
  const header = await readFile(new URL("../include/dolly/threads.h", import.meta.url));
  const digest = createHash("sha256").update(source).update(header).digest();
  const path = process.argv[2];
  await writeFile(path, appendCustomSection(await readFile(path), "dolly.process.layout", digest));
}
