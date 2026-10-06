// Cargo against a sparse registry that holds one crate, served by the test server.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { writeCommand } from "../../../browser.mjs";

function tarEntry(name, text) {
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
    await run('cargo build --offline && test "$(target/debug/cargo-check.js)" = CARGO-LOCAL-OK');
    await run(writeCommand(".cargo/config.toml", `[source.crates-io]\nreplace-with = "fixture"\n[source.fixture]\nregistry = "sparse+${origin}/fixture/cargo/index/"\n`));
    await run(writeCommand("Cargo.toml", '[package]\nname = "cargo-check"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\ndolly-greeting = "1"\n'));
    await run(writeCommand("src/main.rs", 'fn main() { println!("{}", dolly_greeting::greeting()); }\n'));
    await run('cargo build && test "$(target/debug/cargo-check.js)" = CARGO-REGISTRY-OK');
    assert.deepEqual(registry.requests.sort(), ["GET /fixture/cargo/crates/dolly-greeting/1.0.0/download",
      "GET /fixture/cargo/index/config.json", "GET /fixture/cargo/index/do/ll/dolly-greeting"]);
  } finally {
    await submit(`cd /workspace; rm -rf ${root}`);
  }
}
