import assert from "node:assert/strict";
import { shellQuote } from "./slop-cases.mjs";

export const rustToolSources = {
  "macro.rs": "test/fixtures/rust/macro.rs",
  "macro-library.rs": "test/fixtures/rust/macro-library.rs",
  "macro-use.rs": "test/fixtures/rust/macro-use.rs",
};

export async function runRustTools(submit, origin) {
  const root = "/tmp/dolly-rust-check";
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p ${root}`);
  try {
    await run(`cd ${root}`);
    for (const name of Object.keys(rustToolSources)) {
      await run(`curl -fsS ${origin}/fixture/rust/${name} -o ${name}`);
    }
    await run("rustc --crate-name tiny_macro --crate-type proc-macro macro.rs -o tiny_macro.wasm");
    await run("rustc macro-library.rs --edition=2021 --crate-name macro_library --crate-type rlib --extern tiny_macro=tiny_macro.wasm -o libmacro_library.rlib");
    await run("rustc macro-use.rs --edition=2021 --extern macro_library=libmacro_library.rlib -L dependency=. -o macro-use");
    await run("./macro-use && ./macro-use");
    const files = {
      "Cargo.toml": '[package]\nname="macro-use"\nversion="0.0.0"\nedition="2021"\n[dependencies]\nmacro-library={path="library"}\n',
      "library/Cargo.toml": '[package]\nname="macro-library"\nversion="0.0.0"\nedition="2021"\n[dependencies]\ntiny-macro={path="../macro"}\n',
      "macro/Cargo.toml": '[package]\nname="tiny-macro"\nversion="0.0.0"\nedition="2021"\n[lib]\nproc-macro=true\n',
      "Cargo.lock": 'version=4\n[[package]]\nname="macro-use"\nversion="0.0.0"\ndependencies=["macro-library"]\n[[package]]\nname="macro-library"\nversion="0.0.0"\ndependencies=["tiny-macro"]\n[[package]]\nname="tiny-macro"\nversion="0.0.0"\n',
    };
    await run("mkdir -p src library/src macro/src");
    for (const [path, contents] of Object.entries(files)) {
      await run(`printf ${shellQuote(contents.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll("\n", "\\n"))} > ${path}`);
    }
    await run("cp macro.rs macro/src/lib.rs && cp macro-library.rs library/src/lib.rs && cp macro-use.rs src/main.rs");
    await run("patti build --offline --bin macro-use && target/patti/macro-use");
    await run("patti build --offline --resume --bin macro-use && target/patti/macro-use");
  } finally {
    await submit(`cd /workspace; rm -rf ${root}`);
  }
}

export async function runRipgrep(submit) {
  const root = "/tmp/dolly-rg-check";
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p ${root}`);
  try {
    await run(`cd ${root}; printf 'needle one\\nother\\n日本語 needle\\n' > first.txt`);
    await run("printf 'ignored needle\\n' > ignored.txt; printf 'ignored.txt\\n' > .ignore; printf 'hidden needle\\n' > .hidden");
    await run("rg --version | grep -q 'ripgrep 15.1.0'");
    await run('test "$(rg --files .)" = ./first.txt');
    await run('test "$(rg --mmap -n 日本語 first.txt)" = "3:日本語 needle"');
    await run('test "$(rg --no-mmap -c needle first.txt)" = 2');
    await run('test "$(printf \'needle pipe\\nother\\n\' | rg needle -)" = "needle pipe"');
    await run("rg --json needle first.txt | grep -q '\"type\":\"match\"'");
    assert.equal(await submit("rg absent-pattern ."), 1);
    assert.equal(await submit("rg '[' first.txt"), 2);
    await run("printf 'needle changed\\n' > first.txt");
    await run('test "$(rg -n needle .)" = "./first.txt:1:needle changed"');
    const pi = "/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist";
    const probe = `
import { ensureTool } from "${pi}/utils/tools-manager.js";
import { createGrepTool } from "${pi}/core/tools/grep.js";
const messages = [];
if (await ensureTool("rg", status => messages.push(status)) !== "rg" || messages.length) {
  throw new Error("Pi did not find system ripgrep: " + JSON.stringify(messages));
}
const result = await createGrepTool("${root}").execute("rg-check", { pattern: "needle", glob: "first.txt" });
const text = result.content.map(part => part.text ?? "").join("\\n");
if (text.trim() !== "first.txt:1: needle changed") {
  throw new Error("Pi grep returned unexpected matches: " + text);
}
console.log("Pi found system ripgrep and searched through its upstream grep tool");
`;
    await run(`printf %s ${shellQuote(probe.trim().replaceAll("\n", " "))} > ${root}/pi.mjs`);
    await run(`if test -f ${pi}/utils/tools-manager.js; then PI_OFFLINE=1 janis -m ${root}/pi.mjs; fi`);
  } finally {
    await submit(`cd /workspace; rm -rf ${root}`);
  }
}
