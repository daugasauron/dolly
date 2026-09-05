import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { appendCustomSection } from "../src/wasm-interface.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";

// The build passes its pinned container/wasm-as command. All staging is owned
// here and removed even on failure; fixtures never enter the userspace seed.
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("expected the pinned wasm-as command");
const host = await readFile("test/fixtures/process-dso-host.wat", "utf8");
const library = await readFile("test/fixtures/dso-types.wat", "utf8");
function change(source, from, to) {
  if (!source.includes(from)) throw new Error(`missing fixture fragment: ${from}`);
  return source.replace(from, to);
}
const own = '(func (export "answer") (param i64) (result i64) (i64.add (local.get 0) (i64.const 1)))';
const cases = {
  "process-dso-host": host,
  "process-dso-bad-host": change(host, '(export "__dolly_dso_allocate") (param $size i64)',
    '(export "__dolly_dso_allocate") (param $size i32)').replace('(local.get $size)', '(i64.extend_i32_u (local.get $size))'),
  "dso-types": library,
  "dso-local": library.replaceAll('"answer"', '"provided"'),
  "dso-wrong-self": change(library, own, own.replaceAll("i64", "i32")),
  "dso-wrong-provider": change(library, '(import "env" "answer" (func $answer (param i64) (result i64)))',
    '(import "env" "provided" (func $provided (param i32) (result i32)))\n  (func $answer (param i64) (result i64) (local.get 0))'),
  "dso-wrong-stack": change(library, '(global (mut i64))', '(global (mut i32))'),
  "dso-wrong-table": change(library, '(table i64 0 funcref)', '(table 0 funcref)')
    .replace('(global.get $answer)))', '(i32.wrap_i64 (global.get $answer))))'),
  "dso-wrong-memory": change(library, '131072 shared', '131072'),
  "dso-small-memory": change(library, '131072 shared', '1 shared'),
  "dso-small-table": change(library, '(table i64 0 funcref)', '(table i64 0 0 funcref)'),
  "dso-wrong-base": change(library, '"__memory_base" (global i64)', '"__memory_base" (global (mut i64))'),
  "dso-wrong-tag": change(library, '(tag (param i64))', '(tag (param i32))'),
  "dso-wrong-got": change(library, '(global $answer (mut i64))', '(global $answer i64)'),
  "dso-wrong-symbol-kind": change(library, '(import "GOT.func" "answer"', '(import "GOT.func" "data"'),
  "dso-wrong-data": change(library, '(export "data") i64 (i64.const 16384)', '(export "data") i32 (i32.const 16384)'),
  "dso-wrong-hook": change(library, '(export "__wasm_call_ctors")', '(export "__wasm_call_ctors") (param i32)'),
  "dso-start": library.trim().slice(0, -1) + '\n  (func $initialize (i32.store (i64.const 76) (i32.const 1))) (start $initialize))',
};
const staging = await mkdtemp(resolve("build/dso-fixtures-"));
try {
  for (const [name, source] of Object.entries(cases)) {
    const wat = resolve(staging, `${name}.wat`);
    const wasm = resolve(staging, `${name}.wasm`);
    await writeFile(wat, source);
    execFileSync(command, [...args, relative(process.cwd(), wat), "--enable-memory64",
      "--enable-reference-types", "--enable-threads", "--enable-exception-handling", "--disable-compact-imports", "-o",
      relative(process.cwd(), wasm)], { stdio: "inherit" });
    let bytes = new Uint8Array(await readFile(wasm));
    if (name.startsWith("dso-")) {
      bytes = appendCustomSection(bytes, "dylink.0", Uint8Array.of(1, 4, 16, 0, 0, 0));
      bytes = appendCustomSection(bytes, "dolly.process.dso", Buffer.from(DOLLY_PROCESS_ABI_DIGEST, "hex"));
    }
    await writeFile(`build/${name}.wasm`, bytes);
  }
} finally { await rm(staging, { recursive: true, force: true }); }
