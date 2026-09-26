import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("../abi/dolly-host-0.wat", import.meta.url), "utf8");
const constants = [...source.matchAll(/\(global \(export "(DOLLY_HOST_[A-Z_]+)"\) i32 \(i32.const (\d+)\)\)/g)];
if (!constants.length) throw new Error("host contract has no constants");
await writeFile(new URL("../include/dolly/host-abi.h", import.meta.url),
  "/* Generated from abi/dolly-host-0.wat. */\n#pragma once\n" +
  constants.map(([, name, value]) => `#define ${name} ${value}\n`).join(""));
await writeFile(new URL("../src/host/abi.mjs", import.meta.url),
  "// Generated from abi/dolly-host-0.wat.\n" +
  constants.map(([, name, value]) => `export const ${name} = ${value};\n`).join(""));
