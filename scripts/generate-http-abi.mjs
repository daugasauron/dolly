import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("../abi/dolly-http-0.wat", import.meta.url), "utf8");
const constants = [...source.matchAll(/\(global \(export "(DOLLY_HTTP_[A-Z_]+)"\) i32 \(i32.const (\d+)\)\)/g)];
if (!constants.length) throw new Error("HTTP contract has no constants");
await writeFile(new URL("../src/host/http-abi.mjs", import.meta.url),
  "// Generated from abi/dolly-http-0.wat.\n" +
  constants.map(([, name, value]) => `export const ${name} = ${value};\n`).join(""));
