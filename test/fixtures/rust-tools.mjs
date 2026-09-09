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

export async function runFd(submit) {
  const root = "/tmp/dolly-fd-check";
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p ${root}/tree/nested ${root}/pruned/child ${root}/blocked/child`);
  try {
    await run(`cd ${root}; printf 'hello\\n' > tree/first.txt; touch tree/nested/日本語.txt tree/.hidden.txt tree/ignored.txt`);
    await run("printf 'ignored.txt\\n' > tree/.gitignore; touch pruned/child/leaf blocked/STOP blocked/child/leaf");
    await run("fd --version | grep -q 'fd 10.5.0'");
    await run('test "$(fd --color=never --no-require-git -t f -e txt . tree | wc -l)" = 2');
    await run('test "$(fd --color=never --hidden --no-ignore -t f -e txt . tree | wc -l)" = 4');
    await run('test "$(fd --color=never --glob 日本語.txt tree)" = tree/nested/日本語.txt');
    await run('test "$(fd --color=never --max-depth 1 -e txt . tree | wc -l)" = 2');
    await run('test "$(fd --color=never --prune . pruned)" = pruned/child/');
    await run('test -z "$(fd --color=never --ignore-contain STOP . blocked)"');
    await run('test "$(fd --color=never --max-results 1 -e txt . tree | wc -l)" = 1');
    await run('test "$(TZ=UTC fd --color=never --changed-within 1d first tree)" = tree/first.txt');
    await run('test -z "$(TZ=UTC fd --color=never --changed-before 1d first tree)"');
    await run("fd --quiet first tree");
    assert.equal(await submit("fd --quiet absent-pattern tree"), 1);
    assert.equal(await submit("fd '[' tree"), 1);
    assert.equal(await submit("fd --threads 2 first tree"), 1);
    await run('test "$(fd --color=never first tree -x cat {})" = hello');
    await run('test "$(fd --color=never first tree -X cat {})" = hello');
    await run('test "$(fd --color=always first tree | wc -c)" -gt 0');
    await run('test "$(fd --print0 first tree | wc -c)" = 15');
    await run('mv tree/first.txt tree/changed.txt; test "$(fd --color=never changed tree)" = tree/changed.txt');
    const pi = "/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist";
    const probe = `
import { ensureTool } from "${pi}/utils/tools-manager.js";
import { createFindTool } from "${pi}/core/tools/find.js";
const messages = [];
if (await ensureTool("fd", status => messages.push(status)) !== "fd" || messages.length) {
  throw new Error("Pi did not find system fd: " + JSON.stringify(messages));
}
const result = await createFindTool("${root}/tree").execute("fd-check", { pattern: "*.txt" });
const text = result.content.map(part => part.text ?? "").join("\\n");
if (text.trim() !== ".hidden.txt\\nchanged.txt\\nnested/日本語.txt") {
  throw new Error("Pi find returned unexpected matches: " + text);
}
console.log("Pi found system fd without warnings and searched through its upstream find tool");
`;
    await run(`printf %s ${shellQuote(probe.trim().replaceAll("\n", " "))} > ${root}/pi.mjs`);
    await run(`if test -f ${pi}/utils/tools-manager.js; then PI_OFFLINE=1 janis -m ${root}/pi.mjs; fi`);
  } finally {
    await submit(`cd /workspace; rm -rf ${root}`);
  }
}
