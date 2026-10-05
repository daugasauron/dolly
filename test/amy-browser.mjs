import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest, composed } from "./browser.mjs";
import { encodeSnapshotRecords } from "../src/snapshot-records.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";

const packages = DOLLY_IMAGES.filter(definition => definition.role === "package").map(({ image }) => image).sort();
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
  source: "DOLLY 6\nPACKAGE threaded\nREQUIRES HOST threads@0\nFILE /usr/share/threaded\n    needs threads\n" };
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
const timed = async (run, command) => { const started = performance.now(); await run(command); return Math.round(performance.now() - started); };

// amy in a live default session: an install is the INSTALL row executed by
// the engine, served by packages@0, recorded, and kept by a saved session.
try {
await browserTest("amy", { image: "default", timeout: 300_000, server: { fixtures } }, async ({ server, open }) => {
  const policy = { maxRequests: 256, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const session = await open({ policy });
  const run = check(session);
  await run(`test "$(amy list | sed 's/ .*//' | sort | tr '\\n' ' ')" = "${packages.join(" ")} "`);
  await run("test -z \"$(amy installed)\" && ! amy list | grep -q installed");
  await run("! amy install nosuch-package 2> /tmp/amy-error && grep -q nosuch-package /tmp/amy-error");
  await run("! amy 2> /dev/null && ! amy frobnicate 2> /dev/null");
  console.log(`amy install python: ${await timed(run, "amy install python")} ms`);
  await run("test \"$(python3 -c 'print(6 * 7)')\" = 42");
  await run(`test "$(amy installed)" = "python ${pin("python")}" && grep -qx 'INSTALL ${pin("python")}' /etc/dolly/installed`);
  await run("amy list | grep -q '^python *installed$' && test \"$(amy install python)\" = 'amy: python is already installed'");
  // A package's control files describe the package; the session keeps the image's.
  await run("test \"$(cat /etc/dolly/image)\" = default && grep -q '^APPLICATION default' /etc/dolly/Dollyfile");
  // The service answers GET for the index and this release's package pins only.
  await run(`test "$(curl -fsS https://packages.dolly.invalid/v1/index | sed -n '$=')" = ${packages.length}`);
  for (const denied of [`https://packages.dolly.invalid/v1/packages/${"0".repeat(64)}`, "https://packages.dolly.invalid/v1/other",
    "-X POST https://packages.dolly.invalid/v1/index", "'https://packages.dolly.invalid/v1/index?x=1'"]) {
    assert.notEqual(await session.submit(`curl -fsS ${denied} -o /dev/null`), 0, denied);
  }
  // An install is the engine's INSTALL row: a package whose host modules the
  // image declares installs and is recorded, so amy lists it.
  await run(`mkdir -p /etc/dolly/artifacts && curl -fsS ${server.origin}/fixture/threaded.snapshot -o ${artifact}`);
  await run(`dollyfile install ${threaded.url} ${threaded.sha256} && rm ${artifact}`);
  await run(`test "$(cat /usr/share/threaded)" = 'needs threads' && grep -qx '${row}' /etc/dolly/installed`);
  await run(`test "$(amy installed | sed -n 2p)" = "threaded ${threaded.url} ${threaded.sha256}"`);
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
  await run(`test "$(amy installed | sed -n 1p)" = "python ${pin("python")}" && test "$(cat /usr/share/threaded)" = 'needs threads'`);
});

// Compilers, a library and an agent: each installs into a running default
// session and works at once, CMake finding the SDL2 installed beside it.
const programs = {
  cmake: "mkdir /tmp/amy-cmake && cd /tmp/amy-cmake && printf 'int main(void) { return 0; }\\n' > main.c && " +
    "printf '%s\\n' 'cmake_minimum_required(VERSION 3.20)' 'project(probe C)' 'add_executable(probe main.c)' > CMakeLists.txt && " +
    "cmake -B build -DCMAKE_C_FLAGS=-O0 && cmake --build build && build/probe",
  sdl2: "mkdir /tmp/amy-sdl2 && cd /tmp/amy-sdl2 && " +
    "printf '#include <SDL.h>\\nint main(void) { int failed = SDL_Init(SDL_INIT_VIDEO) || !SDL_CreateWindow(\"\", 0, 0, 64, 48, 0); SDL_Quit(); return failed; }\\n' > window.c && " +
    "printf '%s\\n' 'cmake_minimum_required(VERSION 3.20)' 'project(window C)' 'find_package(SDL2 REQUIRED)' 'add_executable(window window.c)' " +
    "'target_link_libraries(window PRIVATE SDL2::SDL2-static)' > CMakeLists.txt && cmake -B build -DCMAKE_C_FLAGS=-O0 && cmake --build build && build/window",
  rust: "printf 'fn main() { println!(\"{}\", 6 * 7); }\\n' > /tmp/amy.rs && rustc /tmp/amy.rs -o /tmp/amy-rust && test \"$(/tmp/amy-rust)\" = 42 && patti --help > /dev/null",
  "codex-cli": "codex --version | grep -q '^codex-cli ' && rg --version > /dev/null && fd --version > /dev/null",
};
await browserTest("amy programs", { image: "default", timeout: 600_000 }, async ({ open }) => {
  const run = check(await open());
  for (const [name, program] of Object.entries(programs)) {
    console.log(`amy install ${name}: ${await timed(run, `amy install ${name}`)} ms`);
    await run(program);
  }
});

// The compiler is a package too: a session composed from the core commands,
// the display and amy installs cc and compiles.
await browserTest("amy cc", { image: "minimal", timeout: 300_000 }, async ({ open }) => {
  const run = check(await open(await composed(["display", "http", "packages"], ["core", "display", "amy"])));
  await run("! cc --version 2> /dev/null");
  console.log(`amy install cc: ${await timed(run, "amy install cc")} ms`);
  await run("echo 'int main(void) { return 42; }' > /tmp/amy-cc.c && cc /tmp/amy-cc.c -o /tmp/amy-cc; /tmp/amy-cc; test $? = 42");
});

// An image that does not declare a package's host module refuses it, naming
// the module, before any file changes; without packages@0 amy has no service.
await browserTest("amy refusal", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { maxRequests: 256, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const system = await open({ policy });
  const refuse = async command => assert.equal(await system.submit(command), 0, `${command}\n${await system.text()}`);
  await refuse(`mkdir -p /etc/dolly/artifacts && curl -fsS ${server.origin}/fixture/threaded.snapshot -o ${artifact}`);
  assert.equal(await system.submit(`dollyfile install ${threaded.url} ${threaded.sha256} 2> /tmp/refused`), 2);
  await refuse("grep -q 'Dollyfile-threaded needs threads@0: add REQUIRES HOST threads@0' /tmp/refused");
  await refuse("test ! -e /usr/share/threaded && test ! -e /etc/dolly/installed");
  assert.notEqual(await system.submit("amy install python 2> /tmp/refused"), 0);
  await refuse("grep -q 'REQUIRES HOST packages@0' /tmp/refused");
  assert.notEqual(await system.submit("curl -fsS https://packages.dolly.invalid/v1/index -o /dev/null"), 0);
});
} finally {
  await rm(scratch, { recursive: true, force: true });
}
