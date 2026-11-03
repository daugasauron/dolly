// Cargo against a sparse registry that holds one crate, served by the test server.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { writeCommand } from "../../../browser.mjs";

export function tarEntry(name, text) {
  const data = Buffer.from(text), header = Buffer.alloc(512);
  header.write(name);
  header.write("0000644\0", 100);
  header.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write("00000000000\0", 136);
  header.write("        0", 148);
  header.write("ustar\x0000", 257);
  header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148);
  return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)]);
}

export function createCargoRegistry() {
  const crate = gzipSync(Buffer.concat([
    tarEntry("dolly-greeting-1.0.0/Cargo.toml", '[package]\nname = "dolly-greeting"\nversion = "1.0.0"\nedition = "2021"\n'),
    tarEntry("dolly-greeting-1.0.0/src/lib.rs", 'pub fn greeting() -> &\'static str { "CARGO-REGISTRY-OK" }\n'),
    Buffer.alloc(1024)]));
  const record = JSON.stringify({ name: "dolly-greeting", vers: "1.0.0", deps: [], features: {}, yanked: false,
    cksum: createHash("sha256").update(crate).digest("hex") }) + "\n";
  const requests = [];
  return {
    requests,
    handle(request, response, url, headers) {
      if (!url.pathname.startsWith("/fixture/cargo/")) return false;
      const origin = `http://${request.headers.host}`;
      requests.push(`${request.method} ${url.pathname}`);
      const body = {
        "/fixture/cargo/index/config.json": JSON.stringify({ dl: `${origin}/fixture/cargo/crates`, api: origin }),
        "/fixture/cargo/index/do/ll/dolly-greeting": record,
        "/fixture/cargo/crates/dolly-greeting/1.0.0/download": crate,
      }[url.pathname];
      response.writeHead(body === undefined ? 404 : 200, headers).end(body);
      return true;
    },
  };
}

// A crate in a Git repository, which native Git serves over smart HTTP.
export function createCargoGitRepository() {
  const directory = mkdtempSync(join(tmpdir(), "dolly-cargo-git-"));
  process.once("exit", () => rmSync(directory, { recursive: true, force: true }));
  const environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Dolly", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_NAME: "Dolly", GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" };
  const git = (args, input, protocol = "") => {
    const result = spawnSync("git", args, { cwd: directory, env: { ...environment, GIT_PROTOCOL: protocol }, input });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
  };
  mkdirSync(join(directory, "src"));
  writeFileSync(join(directory, "Cargo.toml"), '[package]\nname = "dolly-git-greeting"\nversion = "0.1.0"\nedition = "2021"\n');
  writeFileSync(join(directory, "src/lib.rs"), 'pub fn greeting() -> &\'static str { "CARGO-GIT-OK" }\n');
  git(["init", "-q", "-b", "main"]);
  git(["add", "."]);
  git(["commit", "-q", "-m", "crate"]);
  return {
    async handle(request, response, url) {
      const operation = /^\/fixture\/cargo-git\/greeting\.git\/(info\/refs|git-upload-pack)$/.exec(url.pathname)?.[1];
      if (!operation) return false;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const advertisement = operation === "info/refs", protocol = request.headers["git-protocol"] ?? "";
      const body = git(["upload-pack", "--stateless-rpc", ...(advertisement ? ["--advertise-refs"] : []), "."],
        Buffer.concat(chunks), protocol);
      response.writeHead(200, { "cache-control": "no-store",
        "content-type": `application/x-git-upload-pack-${advertisement ? "advertisement" : "result"}` });
      if (advertisement && protocol !== "version=2") response.write("001e# service=git-upload-pack\n0000");
      response.end(body);
      return true;
    },
  };
}

// What SpiderMonkey's configure asks first, then builds without and with the registry.
export async function runCargo(submit, origin, registry) {
  const root = "/tmp/dolly-cargo-check";
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p ${root}/src ${root}/.cargo && cd ${root}`);
  try {
    await run(writeCommand("Cargo.toml", '[package]\nname = "cargo-check"\nversion = "0.1.0"\nedition = "2021"\n'));
    await run(writeCommand("src/main.rs", 'fn main() { println!("CARGO-LOCAL-OK"); }\n'));
    await run("cargo --version | grep -q '^cargo 1.98.1 (797e8a9bc 2026-08-05)$'");
    await run(`cargo metadata --format-version 1 | grep -q '"manifest_path":"${root}/Cargo.toml"'`);
    await run('cargo build --offline && test "$(target/debug/cargo-check)" = CARGO-LOCAL-OK');
    await run(writeCommand(".cargo/config.toml", `[source.crates-io]\nreplace-with = "fixture"\n[source.fixture]\nregistry = "sparse+${origin}/fixture/cargo/index/"\n`));
    await run(writeCommand("Cargo.toml", '[package]\nname = "cargo-check"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\ndolly-greeting = "1"\n'));
    await run(writeCommand("src/main.rs", 'fn main() { println!("{}", dolly_greeting::greeting()); }\n'));
    await run('cargo build && test "$(target/debug/cargo-check)" = CARGO-REGISTRY-OK');
    assert.deepEqual(registry.requests.sort(), ["GET /fixture/cargo/crates/dolly-greeting/1.0.0/download",
      "GET /fixture/cargo/index/config.json", "GET /fixture/cargo/index/do/ll/dolly-greeting"]);
    // A Git dependency comes through git and the broker.
    await run(writeCommand("Cargo.toml", '[package]\nname = "cargo-check"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\n' +
      `dolly-git-greeting = { git = "${origin}/fixture/cargo-git/greeting.git" }\n`));
    await run(writeCommand("src/main.rs", 'fn main() { println!("{}", dolly_git_greeting::greeting()); }\n'));
    await run('cargo build && test "$(target/debug/cargo-check)" = CARGO-GIT-OK');
  } finally {
    await submit(`cd /workspace; rm -rf ${root}`);
  }
}

const unwinding = `struct Noisy;
impl Drop for Noisy {
    fn drop(&mut self) { println!("dropped"); }
}

fn index(values: &[u8], at: usize) -> u8 { values[at] }

fn main() {
    let caught = std::panic::catch_unwind(|| { let _noisy = Noisy; index(&[], 0) });
    println!("caught: {}", caught.is_err());
    println!("joined: {}", std::thread::spawn(|| index(&[], 1)).join().is_err());
    let _noisy = Noisy;
    index(&[7], 2);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn passes() { assert_eq!(index(&[7], 0), 7); }
    #[test]
    fn fails() { assert_eq!(index(&[7], 0), 8); }
    #[test]
    #[should_panic(expected = "index out of bounds")]
    fn panics() { index(&[], 0); }
}
`;

// Panics unwind, as on every native target: cargo test runs each test in the
// process and reports a failure with status 101, catch_unwind and a thread's
// join see a panic, and a panic that ends main runs its drops first.
export async function runCargoTest(submit) {
  const root = "/tmp/dolly-cargo-test";
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p ${root}/src && cd ${root}`);
  try {
    await run(writeCommand("Cargo.toml", '[package]\nname = "unwinds"\nversion = "0.1.0"\nedition = "2024"\n'));
    await run(writeCommand("src/main.rs", unwinding));
    assert.equal(await submit("cargo test --offline > test.txt 2>&1"), 101);
    await run("grep -qx 'test tests::passes ... ok' test.txt && grep -qx 'test tests::fails ... FAILED' test.txt && " +
      "grep -qx 'test tests::panics - should panic ... ok' test.txt && grep -q '^test result: FAILED. 2 passed; 1 failed;' test.txt");
    await run("cargo test --offline passes > test.txt 2>&1 && grep -q '^test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 2 filtered out' test.txt");
    assert.equal(await submit("cargo run --offline > run.txt 2>/dev/null"), 101);
    await run(`test "$(cat run.txt)" = "$(printf 'dropped\\ncaught: true\\njoined: true\\ndropped')"`);
    // A program built to abort links the same library and ends at its first panic.
    assert.equal(await submit("CARGO_PROFILE_DEV_PANIC=abort cargo run --offline > run.txt 2>/dev/null"), 134);
    await run("test ! -s run.txt");
    // A library's doc tests run after its tests.
    await run(`mkdir -p ${root}/doubles/src && cd ${root}/doubles`);
    await run(writeCommand("Cargo.toml", '[package]\nname = "doubles"\nversion = "0.1.0"\nedition = "2024"\n'));
    await run(writeCommand("src/lib.rs", "/// ```\n/// assert_eq!(doubles::twice(2), 4);\n/// ```\npub fn twice(value: u8) -> u8 { value * 2 }\n"));
    await run("cargo test --offline > test.txt 2>&1 && grep -q '^   Doc-tests doubles' test.txt && " +
      "grep -q '^test src/lib.rs - twice (line 1) ... ok' test.txt");
    await run(writeCommand("src/lib.rs", "/// ```\n/// assert_eq!(doubles::twice(2), 5);\n/// ```\npub fn twice(value: u8) -> u8 { value * 2 }\n"));
    assert.equal(await submit("cargo test --offline > test.txt 2>&1"), 101);
    await run("grep -q '^test src/lib.rs - twice (line 1) ... FAILED' test.txt");
    // Before edition 2024 each doc test is a program of its own.
    await run(writeCommand("Cargo.toml", '[package]\nname = "doubles"\nversion = "0.1.0"\nedition = "2021"\n'));
    await run(writeCommand("src/lib.rs", "/// ```\n/// assert_eq!(doubles::twice(2), 4);\n/// ```\npub fn twice(value: u8) -> u8 { value * 2 }\n"));
    await run("cargo test --offline > test.txt 2>&1 && grep -q '^test src/lib.rs - twice (line 1) ... ok' test.txt");
  } finally {
    await submit(`cd /workspace; rm -rf ${root}`);
  }
}
