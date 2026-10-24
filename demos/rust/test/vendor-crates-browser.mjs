// vendor-crates in default, as a person uses it: amy installs cargo and the
// tool, which resolves a project's crates over the index's GitHub mirror and
// fetches them from static.crates.io (both stood in for by this server), and
// cargo build --offline builds from vendor/. The newest admitted version, an
// optional dependency a feature enables, another target's dependency and no
// dependency's dev-dependency; then a crate whose checksum does not match, and
// a Cargo.lock's versions without the index.
// Usage: node demos/rust/test/vendor-crates-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { demoTest, redirectFetch, writeCommand } from "../../browser.mjs";
import { tarEntry } from "./fixtures/cargo.mjs";

const index = "/fixture/crates-index/rust-lang/crates.io-index/master/do/ll/", downloads = "/fixture/crates-dl/crates/";
function crate(name, version, manifest, source) {
  const bytes = gzipSync(Buffer.concat([
    tarEntry(`${name}-${version}/Cargo.toml`, `[package]\nname = "${name}"\nversion = "${version}"\nedition = "2021"\n${manifest}`),
    tarEntry(`${name}-${version}/src/lib.rs`, source), Buffer.alloc(1024)]));
  return { name, version, bytes, cksum: createHash("sha256").update(bytes).digest("hex") };
}
const dependency = (name, req, more = {}) => ({ name, req, features: [], optional: false, default_features: true, target: null, kind: "normal", ...more });
const lib = text => `pub fn describe() -> String { ${text} }\n`;
const crates = [
  [crate("dolly-top", "1.0.0", "", lib('"TOP-1.0.0".into()')), []],
  [crate("dolly-top", "1.1.0", '[features]\nextra = ["dep:dolly-extra"]\n[dependencies]\ndolly-base = "0.3"\n' +
    'dolly-extra = { version = "2", optional = true }\n[target.\'cfg(windows)\'.dependencies]\ndolly-windows = "1"\n' +
    '[dev-dependencies]\ndolly-devonly = "1"\n',
  lib('let extra = if cfg!(feature = "extra") { dolly_extra::describe() } else { String::new() }; ' +
    'format!("TOP-1.1.0 {} {}", dolly_base::describe(), extra)')),
  [dependency("dolly-base", "^0.3"), dependency("dolly-extra", "^2", { optional: true }),
    dependency("dolly-windows", "^1", { target: "cfg(windows)" }), dependency("dolly-devonly", "^1", { kind: "dev" })],
  { extra: ["dep:dolly-extra"] }],
  [crate("dolly-top", "1.2.0", "", lib('"YANKED".into()')), [], {}, true],
  [crate("dolly-base", "0.3.1", "", lib('"BASE-0.3.1".into()')), []],
  [crate("dolly-base", "0.4.0", "", lib('"BASE-0.4.0".into()')), []],
  [crate("dolly-extra", "2.0.0", "", lib('"EXTRA-2.0.0".into()')), []],
  [crate("dolly-windows", "1.0.0", "", lib('"WINDOWS".into()')), []],
  [crate("dolly-bad", "1.0.0", "", lib('"BAD".into()')), [], {}, false, "0".repeat(64)],
];
const records = new Map(), archives = new Map();
for (const [{ name, version, bytes, cksum }, deps, features = {}, yanked = false, listed = cksum] of crates) {
  records.set(name, (records.get(name) ?? "") + JSON.stringify({ name, vers: version, deps, features, cksum: listed, yanked, v: 2 }) + "\n");
  archives.set(`${downloads}${name}/${name}-${version}.crate`, bytes);
}
const requests = [];
const handle = (request, response, path, headers) => {
  const body = path.startsWith(index) ? records.get(path.slice(index.length)) : archives.get(path);
  if (!path.startsWith(index) && !path.startsWith(downloads)) return false;
  requests.push(path);
  response.writeHead(body === undefined ? 404 : 200, { ...headers, "access-control-allow-origin": "*" }).end(body);
  return true;
};

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
for (const browser of browsers) {
  requests.length = 0;
  await demoTest("vendor-crates", { image: "default", timeout: 600_000, browser, server: { handle } }, async ({ server, open }) => {
    const setup = async page => {
      await redirectFetch("https://raw.githubusercontent.com", `${server.origin}/fixture/crates-index`)(page);
      await redirectFetch("https://static.crates.io", `${server.origin}/fixture/crates-dl`)(page);
    };
    const { run, submit, text } = await open({ setup });
    await run("amy install cargo vendor-crates");
    await run("mkdir -p /tmp/vendored/src && cd /tmp/vendored");
    await run(writeCommand("Cargo.toml", '[package]\nname = "vendored"\nversion = "0.1.0"\nedition = "2021"\n' +
      '[dependencies]\ndolly-top = { version = "1", features = ["extra"] }\n'));
    await run(writeCommand("src/main.rs", 'fn main() { println!("{}", dolly_top::describe()); }\n'));
    await run("vendor-crates");
    await run("ls vendor > /tmp/vendored.list && test \"$(cat /tmp/vendored.list | tr '\\n' ' ')\" = " +
      "'dolly-base-0.3.1 dolly-extra-2.0.0 dolly-top-1.1.0 dolly-windows-1.0.0 '");
    await run("grep -q 'replace-with = \"vendored-sources\"' .cargo/config.toml");
    await run('cargo build --offline && test "$(target/debug/vendored)" = "TOP-1.1.0 BASE-0.3.1 EXTRA-2.0.0"');
    assert.ok(!requests.some(path => path.endsWith("dolly-devonly")), "a dependency's dev-dependency is not resolved");

    // The locked versions, without the index.
    const indexed = requests.filter(path => path.startsWith(index)).length;
    await run("rm -r vendor && vendor-crates && cargo build --offline");
    assert.equal(requests.filter(path => path.startsWith(index)).length, indexed);

    // A crate that does not match the index's checksum is not vendored.
    await run("rm Cargo.lock && printf 'dolly-bad = \"1\"\\n' >> Cargo.toml");
    assert.equal(await submit("vendor-crates"), 1);
    assert.match(await text(), /dolly-bad@1\.0\.0: the crate does not match its checksum/);
    await run("test ! -e vendor/dolly-bad-1.0.0");
  });
}
