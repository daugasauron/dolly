import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest } from "./browser.mjs";
import { encodeSnapshotRecords } from "../src/snapshot-records.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";

const packages = DOLLY_IMAGES.filter(definition => definition.role === "package").map(({ image }) => image).sort();
// The packages default's recipe installs.
const preinstalled = [...(await readFile(new URL("../Dollyfile", import.meta.url), "utf8")).matchAll(/^INSTALL \S+Dollyfile-(\S+) /gm)]
  .map(([, name]) => name).sort();
// The site's index, as generated: NAME URL SHA256 DESCRIPTION.
const index = await readFile(new URL("../amy-index.txt", import.meta.url), "utf8");
const indexed = name => index.split("\n").find(row => row.startsWith(`${name} `)).split(" ");
const pin = name => {
  const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
  return `${CANONICAL_ORIGIN}/${dollyfile} ${sha256}`;
};
const sha256 = text => createHash("sha256").update(text).digest("hex");

// A sealed package that needs threads@0, as the engine would build it: the
// retained recipe plus its receipt (recipe chain, host requirements, exports).
const encoder = new TextEncoder();
const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; };
const text = value => [u32(encoder.encode(value).length), encoder.encode(value)];
const threaded = { url: `${CANONICAL_ORIGIN}/Dollyfile-threaded`,
  source: "DOLLY 6\nPACKAGE threaded\nREQUIRES HOST runtime@0\nREQUIRES HOST threads@0\nFILE /usr/share/threaded\n    needs threads\n" };
threaded.sha256 = sha256(threaded.source);
const receipt = [encoder.encode("DOLLYART"), u32(5), u32(1),
  ...["PACKAGE", "threaded", threaded.url, threaded.sha256, threaded.source].flatMap(text),
  u32(1), ...text("threads@0"), u32(1), ...text("FILE"), ...text("threaded"), ...text("/usr/share/threaded"), u32(1),
  ...text("/usr/share/threaded")];
const bytes = parts => { const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; } return joined; };
const file = data => ({ kind: 2, data: encoder.encode(data) });
const snapshot = encodeSnapshotRecords(new Map([["/etc/dolly/Dollyfile", file(threaded.source)],
  ["/etc/dolly/artifact", { kind: 2, data: bytes(receipt) }], ["/usr/share/threaded", file("needs threads\n")]]));
const scratch = await mkdtemp(join(tmpdir(), "dolly-amy-"));
await writeFile(join(scratch, "threaded.snapshot"), snapshot);
const fixtures = { "threaded.snapshot": join(scratch, "threaded.snapshot") };
const artifact = `/etc/dolly/artifacts/${threaded.sha256}.snapshot`;
const row = `INSTALL ${threaded.url} ${threaded.sha256}`;
const check = ({ submit, text }) => async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
// What a restricted page adds for amy: its own site's index.
const indexRule = origin => ({ origin, path: "/amy-index.txt", methods: ["GET"] });
// While set, the site answers with this index, as after a newer release.
const site = { index: null };
function handle(request, response, path, headers) {
  if (path !== "/amy-index.txt" || site.index === null) return false;
  response.writeHead(200, { ...headers, "content-type": "text/plain; charset=utf-8" }).end(site.index);
  return true;
}
const timed = async (run, command) => { const started = performance.now(); await run(command); return Math.round(performance.now() - started); };

// amy in a live default session: the index is the site's public file, an
// install is the INSTALL row executed by the engine, served by packages@0,
// recorded, and kept by a saved session.
try {
await browserTest("amy", { image: "default", timeout: 300_000, server: { fixtures, handle } }, async ({ server, open }) => {
  const policy = { maxRequests: 256, rules: [indexRule(server.origin),
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const session = await open({ policy });
  const run = check(session);
  await run(`test "$(amy list | sed 's/ .*//' | sort | tr '\\n' ' ')" = "${packages.join(" ")} "`);
  // The record lists what the image's recipes installed, before the session adds to it.
  await run(`test "$(amy list | awk '$2 == "installed" { print $1 }' | tr '\\n' ' ')" = '${preinstalled.join(" ")} '`);
  // Each row carries the index's description and the INSTALL row a recipe writes.
  const [, curlUrl, curlPin, ...description] = indexed("curl");
  await run(`test "$(amy info curl)" = "$(printf '%s\\n' 'curl: ${description.join(" ")}' 'INSTALL ${curlUrl} ${curlPin}' installed)"`);
  await run(`amy list | grep -q '^curl  *installed  *${description.join(" ")}$'`);
  // The files of a package the image installed come from the release's snapshot, sizes included.
  await run("amy files curl > /tmp/curl-files && grep -q ' /usr/bin/curl$' /tmp/curl-files && ! grep -q ' /etc/dolly/' /tmp/curl-files");
  await run("while read size path; do test \"$(stat -c %s \"$path\")\" = \"$size\" || exit 1; done < /tmp/curl-files");
  await run("test \"$(amy install curl)\" = 'amy: curl is already installed'");
  await run("! amy install nosuch-package 2> /tmp/amy-error && grep -q nosuch-package /tmp/amy-error");
  await run("! amy 2> /dev/null && ! amy frobnicate 2> /dev/null");
  console.log(`amy install python: ${await timed(run, "amy install python > /tmp/amy-python")} ms`);
  await run("test \"$(python3 -c 'print(6 * 7)')\" = 42");
  // The install says what it added and keeps the list: no index or service is needed to read it.
  await run("grep -q '^amy: python installed: [1-9][0-9]* files, [1-9][0-9]* bytes, commands:.* python3' /tmp/amy-python");
  await run("test \"$(amy files python | wc -l)\" -eq \"$(sed -n 's/^amy: python installed: \\([0-9]*\\) files.*/\\1/p' /tmp/amy-python)\"");
  await run("amy files python | grep ' /usr/bin/python3$' | { read size path; test \"$(stat -c %s \"$path\")\" = \"$size\"; }");
  await run(`test "$(amy installed | tail -n 1)" = "python ${pin("python")}" && grep -qx 'INSTALL ${pin("python")}' /etc/dolly/installed`);
  await run("amy list | grep -q '^python  *installed ' && test \"$(amy install python)\" = 'amy: python is already installed'");
  // A package's control files describe the package; the session keeps the image's.
  await run("test \"$(cat /etc/dolly/image)\" = default && grep -q '^APPLICATION default' /etc/dolly/Dollyfile");
  // The service answers GET for this release's package pins only.
  for (const denied of [`https://packages.dolly.invalid/v1/packages/${"0".repeat(64)}`, "https://packages.dolly.invalid/v1/index",
    `-X POST https://packages.dolly.invalid/v1/packages/${curlPin}`, `'https://packages.dolly.invalid/v1/packages/${curlPin}?x=1'`]) {
    assert.notEqual(await session.submit(`curl -fsS ${denied} -o /dev/null`), 0, denied);
  }
  // The site's index describes its newest release. A row this tab's release
  // does not publish fails by name and installs nothing.
  site.index = `gzip ${indexed("gzip")[1]} ${"0".repeat(64)} from a newer release\n`;
  assert.notEqual(await session.submit("amy install gzip 2> /tmp/amy-stale"), 0);
  await run("grep -q '^amy: gzip: ' /tmp/amy-stale && ! amy installed | grep -q '^gzip '");
  site.index = null;
  // An install is the engine's INSTALL row: a package whose host modules the
  // image declares installs and is recorded, so amy lists it.
  await run(`mkdir -p /etc/dolly/artifacts && curl -fsS ${server.origin}/fixture/threaded.snapshot -o ${artifact}`);
  await run(`dollyfile install ${threaded.url} ${threaded.sha256} && rm ${artifact}`);
  await run(`test "$(cat /usr/share/threaded)" = 'needs threads' && grep -qx '${row}' /etc/dolly/installed`);
  await run(`test "$(amy installed | tail -n 1)" = "threaded ${threaded.url} ${threaded.sha256}"`);
  // Saved and reloaded, the installed tools and environment are there.
  assert.equal(await session.page.evaluate(() => __dolly.saveSession("amy-proof")), "amy-proof");
  const delta = Number(await session.page.evaluate(() => document.documentElement.dataset.sessionUncompressedBytes));
  const stored = Number(await session.page.evaluate(() => document.documentElement.dataset.sessionBytes));
  console.log(`amy session: ${delta} bytes of changes, ${stored} bytes stored`);
  await session.page.goto(`${server.origin}/session/?name=amy-proof`);
  await session.page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await session.page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await session.page.locator("#bootstrap-log").textContent());
  await session.page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  await run("test \"$(python3 -c 'print(6 * 7)')\" = 42 && test \"$PYTHONUTF8\" = 1 && test \"$PYTHONDONTWRITEBYTECODE\" = 1");
  await run(`amy installed | grep -qx "python ${pin("python")}" && test "$(cat /usr/share/threaded)" = 'needs threads'`);
});

// Compilers, a library and an agent: each installs into a running default
// session and works at once, CMake finding the SDL2 installed beside it.
const programs = {
  cc: "cc --version > /dev/null && make --version > /dev/null",
  cmake: "mkdir /tmp/amy-cmake && cd /tmp/amy-cmake && printf 'int main(void) { return 0; }\\n' > main.c && " +
    "printf '%s\\n' 'cmake_minimum_required(VERSION 3.20)' 'project(probe C)' 'add_executable(probe main.c)' > CMakeLists.txt && " +
    "cmake -B build -DCMAKE_C_FLAGS=-O0 && cmake --build build && build/probe",
  sdl2: "mkdir /tmp/amy-sdl2 && cd /tmp/amy-sdl2 && " +
    "printf '#include <SDL.h>\\nint main(void) { int failed = SDL_Init(SDL_INIT_VIDEO) || !SDL_CreateWindow(\"\", 0, 0, 64, 48, 0); SDL_Quit(); return failed; }\\n' > window.c && " +
    "printf '%s\\n' 'cmake_minimum_required(VERSION 3.20)' 'project(window C)' 'find_package(SDL2 REQUIRED)' 'add_executable(window window.c)' " +
    "'target_link_libraries(window PRIVATE SDL2::SDL2-static)' > CMakeLists.txt && cmake -B build -DCMAKE_C_FLAGS=-O0 && cmake --build build && build/window",
  rust: "printf 'fn main() { println!(\"{}\", 6 * 7); }\\n' > /tmp/amy.rs && rustc /tmp/amy.rs -o /tmp/amy-rust && test \"$(/tmp/amy-rust)\" = 42 && patti --help > /dev/null",
  // codex-cli installs ripgrep and fd: their rows come with it.
  "codex-cli": "codex --version | grep -q '^codex-cli ' && fd --version > /dev/null && amy list | grep -q '^ripgrep  *installed '",
};
await browserTest("amy programs", { image: "default", timeout: 600_000 }, async ({ open }) => {
  const run = check(await open());
  for (const [name, program] of Object.entries(programs)) {
    console.log(`amy install ${name}: ${await timed(run, `amy install ${name}`)} ms`);
    await run(program);
  }
});

// A package brings the programs its own programs start. rustc links through
// cc, which default lacks: installed alone, rust links a program and cargo
// builds a crate. (A package's environment applies from the next session
// load, so the build names what the cargo package exports.)
const crate = "mkdir -p /tmp/amy-crate/src && cd /tmp/amy-crate && " +
  "printf '[package]\\nname = \"amy-crate\"\\nversion = \"0.1.0\"\\nedition = \"2021\"\\n' > Cargo.toml && " +
  "printf 'fn main() { println!(\"{}\", 6 * 7); }\\n' > src/main.rs && " +
  "CARGO_INCREMENTAL=0 cargo build --offline && test \"$(target/debug/amy-crate)\" = 42";
for (const [name, program] of [["rust", programs.rust], ["cargo", crate]]) {
  await browserTest(`amy ${name} alone`, { image: "default", timeout: 300_000 }, async ({ open }) => {
    const run = check(await open());
    await run("! cc --version 2> /dev/null");
    console.log(`amy install ${name} alone: ${await timed(run, `amy install ${name}`)} ms`);
    await run(program);
  });
}

// The compiler is a package: default has none until amy installs it.
await browserTest("amy cc", { image: "default", timeout: 300_000 }, async ({ open }) => {
  const run = check(await open());
  await run("! cc --version 2> /dev/null");
  console.log(`amy install cc: ${await timed(run, "amy install cc")} ms`);
  await run("echo 'int main(void) { return 42; }' > /tmp/amy-cc.c && cc /tmp/amy-cc.c -o /tmp/amy-cc; /tmp/amy-cc; test $? = 42");
});

// An image that does not declare a package's host module refuses it, naming
// the module, before any file changes; without packages@0 amy has no service.
await browserTest("amy refusal", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { maxRequests: 256, rules: [indexRule(server.origin),
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const system = await open({ policy });
  const refuse = async command => assert.equal(await system.submit(command), 0, `${command}\n${await system.text()}`);
  await refuse(`mkdir -p /etc/dolly/artifacts && curl -fsS ${server.origin}/fixture/threaded.snapshot -o ${artifact}`);
  assert.equal(await system.submit(`dollyfile install ${threaded.url} ${threaded.sha256} 2> /tmp/refused`), 2);
  await refuse("grep -q 'Dollyfile-threaded needs threads@0: add REQUIRES HOST threads@0' /tmp/refused");
  await refuse("test ! -e /usr/share/threaded && ! grep -q threaded /etc/dolly/installed");
  assert.notEqual(await system.submit("amy install python 2> /tmp/refused"), 0);
  await refuse("grep -q 'REQUIRES HOST packages@0' /tmp/refused");
  assert.notEqual(await system.submit(`curl -fsS https://packages.dolly.invalid/v1/packages/${indexed("zlib")[2]} -o /dev/null`), 0);
});
} finally {
  await rm(scratch, { recursive: true, force: true });
}
