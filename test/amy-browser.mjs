import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest } from "./browser.mjs";
import { encodeSnapshotRecords } from "../src/snapshot-records.mjs";
import { siteReference } from "../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";

const packages = DOLLY_IMAGES.filter(definition => definition.role === "package").map(({ image }) => image).sort();
// The packages default's recipe installs.
const preinstalled = [...(await readFile(new URL("../Dollyfile", import.meta.url), "utf8")).matchAll(/^INSTALL \S+Dollyfile-(\S+) /gm)]
  .map(([, name]) => name).sort();
// The site's index, as generated: NAME RECIPE SHA256 DESCRIPTION.
const index = await readFile(new URL("../amy-index.txt", import.meta.url), "utf8");
const indexed = name => index.split("\n").find(row => row.startsWith(`${name} `)).split(" ");
const pin = name => {
  const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
  return `${siteReference(dollyfile)} ${sha256}`;
};
const sha256 = text => createHash("sha256").update(text).digest("hex");

// A sealed package that needs threads@0, as the engine would build it: the
// retained recipe plus its receipt (recipe chain, host requirements, exports).
const encoder = new TextEncoder();
const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; };
const text = value => [u32(encoder.encode(value).length), encoder.encode(value)];
const threaded = { url: siteReference("Dollyfile-threaded"),
  source: "DOLLY 7\nPACKAGE threaded\nREQUIRES HOST runtime@0\nREQUIRES HOST threads@0\nFILE /usr/share/threaded\n    needs threads\n" };
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

// Compilers, libraries and an agent: each installs into a running default
// session and works at once, CMake finding the SDL2 installed beside it. A
// library installs no compiler: cc, first here, links the programs.
const programs = {
  cc: "cc --version > /dev/null && make --version > /dev/null",
  cmake: "mkdir /tmp/amy-cmake && cd /tmp/amy-cmake && printf 'int main(void) { return 0; }\\n' > main.c && " +
    "printf '%s\\n' 'cmake_minimum_required(VERSION 3.20)' 'project(probe C)' 'add_executable(probe main.c)' > CMakeLists.txt && " +
    "cmake -B build -DCMAKE_C_FLAGS=-O0 && cmake --build build && build/probe",
  sdl2: "mkdir /tmp/amy-sdl2 && cd /tmp/amy-sdl2 && " +
    "printf '#include <SDL.h>\\nint main(void) { int failed = SDL_Init(SDL_INIT_VIDEO) || !SDL_CreateWindow(\"\", 0, 0, 64, 48, 0); SDL_Quit(); return failed; }\\n' > window.c && " +
    "printf '%s\\n' 'cmake_minimum_required(VERSION 3.20)' 'project(window C)' 'find_package(SDL2 REQUIRED)' 'add_executable(window window.c)' " +
    "'target_link_libraries(window PRIVATE SDL2::SDL2-static)' > CMakeLists.txt && cmake -B build -DCMAKE_C_FLAGS=-O0 && cmake --build build && build/window",
  rust: "printf 'fn main() { println!(\"{}\", 6 * 7); }\\n' > /tmp/amy.rs && rustc /tmp/amy.rs -o /tmp/amy-rust && test \"$(/tmp/amy-rust)\" = 42",
  // codex-cli installs ripgrep and fd: their rows come with it.
  "codex-cli": "codex --version | grep -q '^codex-cli ' && fd --version > /dev/null && amy list | grep -q '^ripgrep  *installed '",
  zlib: "printf '#include <zlib.h>\\n#include <string.h>\\nint main(void) { return strcmp(zlibVersion(), ZLIB_VERSION) != 0; }\\n' > /tmp/amy-zlib.c && " +
    "cc /tmp/amy-zlib.c -lz -o /tmp/amy-zlib && /tmp/amy-zlib",
  libuv: "printf '%s\\n' '#include <uv.h>' 'static int fired;' 'static void fire(uv_timer_t *timer) { fired = 1; uv_close((uv_handle_t *)timer, 0); }' " +
    "'int main(void) { uv_loop_t loop; uv_timer_t timer; uv_loop_init(&loop); uv_timer_init(&loop, &timer); uv_timer_start(&timer, fire, 1, 0); " +
    "uv_run(&loop, UV_RUN_DEFAULT); return uv_loop_close(&loop) != 0 || !fired; }' > /tmp/amy-uv.c && cc -O0 /tmp/amy-uv.c -luv -o /tmp/amy-uv && /tmp/amy-uv",
  // A timer writes into a pipe whose other end the same loop watches.
  libevent: "printf '%s\\n' '#include <event2/event.h>' '#include <unistd.h>' " +
    "'static void heard(evutil_socket_t end, short what, void *seen) { char byte; *(int *)seen += read(end, &byte, 1) == 1 && byte == *\"p\"; }' " +
    "'static void fire(evutil_socket_t none, short what, void *end) { write(*(int *)end, \"p\", 1); }' " +
    "'int main(void) { int ends[2], seen = 0; struct timeval soon = { 0, 1000 }; struct event_base *base = event_base_new(); " +
    "if (base == NULL || pipe(ends) != 0) return 2; event_base_once(base, ends[0], EV_READ, heard, &seen, NULL); " +
    "event_base_once(base, -1, EV_TIMEOUT, fire, &ends[1], &soon); return event_base_dispatch(base) < 0 || seen != 1; }' " +
    "> /tmp/amy-event.c && cc -O0 /tmp/amy-event.c -levent_core -o /tmp/amy-event && /tmp/amy-event",
  // The description of the display's terminal, and a cursor address written from it.
  libterminfo: "printf '%s\\n' '#include <term.h>' '#include <string.h>' " +
    "'int main(void) { int error; if (setupterm(\"xterm-256color\", 1, &error) != OK) return 2; " +
    "return tigetnum(\"colors\") != 256 || strcmp(tiparm(tigetstr(\"cup\"), 4, 9), \"\\033[5;10H\") != 0; }' " +
    "> /tmp/amy-term.c && cc -O0 /tmp/amy-term.c -lterminfo -o /tmp/amy-term && /tmp/amy-term",
  // pkg-config knows a library once its package is there, and gives cc its flags.
  pkgconf: "man pkgconf > /dev/null && ! pkg-config --exists libpng",
  libpng: "printf '#include <png.h>\\nint main(void) { return png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL) == NULL; }\\n' > /tmp/amy-png.c && " +
    "cc $(pkg-config --cflags libpng) /tmp/amy-png.c $(pkg-config --static --libs libpng) -o /tmp/amy-png && /tmp/amy-png",
  // FreeType reads the terminal's font.
  freetype: "printf '%s\\n' '#include <ft2build.h>' '#include FT_FREETYPE_H' 'int main(void) { FT_Library library; FT_Face face; " +
    "if (FT_Init_FreeType(&library) || FT_New_Face(library, \"/usr/share/fonts/IosevkaTerm-SemiBold.ttf\", 0, &face)) return 1; return face->num_glyphs < 100; }' " +
    "> /tmp/amy-freetype.c && cc $(pkg-config --cflags freetype2) /tmp/amy-freetype.c $(pkg-config --static --libs freetype2) -o /tmp/amy-freetype && /tmp/amy-freetype",
  // One frame drawn by raylib's software renderer and shown through Dolly's adapter.
  raylib: "printf '%s\\n' '#include <dolly/raylib.h>' 'int main(void) { dolly_raylib window; if (dolly_raylib_open(&window, \"amy\") != 0) return 2; " +
    "BeginDrawing(); ClearBackground(RAYWHITE); DrawCircle(64, 64, 32, RED); int shown = dolly_raylib_end_frame(&window); " +
    "return dolly_raylib_close(&window) != 0 || shown != 0; }' > /tmp/amy-raylib.c && " +
    "cc -O0 /tmp/amy-raylib.c -ldolly-raylib -lraylib -lm -o /tmp/amy-raylib && /tmp/amy-raylib > /dev/null",
  // A body dropped for a second falls.
  box3d: "printf '%s\\n' '#include <box3d/box3d.h>' 'int main(void) { b3WorldDef world = b3DefaultWorldDef(); b3WorldId id = b3CreateWorld(&world); " +
    "b3BodyDef body = b3DefaultBodyDef(); body.type = b3_dynamicBody; b3BodyId ball = b3CreateBody(id, &body); b3ShapeDef shape = b3DefaultShapeDef(); " +
    "b3Sphere sphere = { { 0.0f, 0.0f, 0.0f }, 0.5f }; b3CreateSphereShape(ball, &shape, &sphere); " +
    "for (int step = 0; step < 60; ++step) b3World_Step(id, 1.0f / 60.0f, 4); int fell = b3Body_GetPosition(ball).y < -1.0f; b3DestroyWorld(id); return !fell; }' " +
    "> /tmp/amy-box3d.c && cc -O0 -U__SIZEOF_INT128__ /tmp/amy-box3d.c -lbox3d -o /tmp/amy-box3d && /tmp/amy-box3d",
};
await browserTest("amy programs", { image: "default", timeout: 600_000 }, async ({ open }) => {
  const run = check(await open());
  for (const [name, program] of Object.entries(programs)) {
    console.log(`amy install ${name}: ${await timed(run, `amy install ${name}`)} ms`);
    await run(program);
  }
});

// What a session adds one package at a time: each command is absent from
// default, installs alone and is used. None brings the compiler until zig,
// which writes C for it. transfer holds the two commands default copies.
const tools = {
  ninja: ["ninja", "mkdir /tmp/amy-ninja && cd /tmp/amy-ninja && printf '%s\\n' 'rule write' '  command = echo built > $out' 'build out: write' > build.ninja && " +
    "ninja && test \"$(cat out)\" = built && man ninja > /dev/null"],
  make: ["make", "mkdir /tmp/amy-make && cd /tmp/amy-make && printf 'out:\\n\\techo made > out\\n' > Makefile && make && test \"$(cat out)\" = made"],
  // The interpreter and the two modules built for it.
  lua: ["lua", "test \"$(lua -e 'local lpeg, uv = require(\"lpeg\"), require(\"luv\"); assert(uv.now() >= 0); print(lpeg.match(lpeg.R(\"09\")^1, \"42\") * 14)')\" = 42"],
  "session-recover": ["session-recover", "session-recover --help | grep -q '^usage: session-recover' && ! session-recover /tmp/missing /tmp/recovered 2> /dev/null"],
  // "packed", compressed.
  gzip: ["gzip", "printf '\\037\\213\\010\\000\\000\\000\\000\\000\\002\\003\\053\\110\\114\\316\\116\\115\\341\\002\\000\\103\\340\\101\\057\\007\\000\\000\\000' | gzip -dc | grep -qx packed"],
  // Janis starts its children with sh, which posix holds.
  javascript: ["qjs", "test \"$(qjs -e 'console.log(6 * 7)')\" = 42 && " +
    "test \"$(janis -e 'console.log(require(\"node:child_process\").execSync(\"echo spawned\").toString().trim())')\" = spawned"],
  nvim: ["nvim", "nvim --headless -c 'call writefile([\"written\"], \"/tmp/amy-nvim\")' -c 'qa!' && test \"$(cat /tmp/amy-nvim)\" = written"],
  emacs: ["emacs", "test \"$(emacs --batch --eval '(princ (* 6 7))')\" = 42"],
  ripgrep: ["rg", "mkdir /tmp/amy-hay && echo needle > /tmp/amy-hay/stack && rg -q needle /tmp/amy-hay"],
  fd: ["fd", "test \"$(fd stack /tmp/amy-hay)\" = /tmp/amy-hay/stack"],
  protox: ["protox", "cd /tmp && printf 'syntax = \"proto3\";\\nmessage Probe { string name = 1; }\\n' > amy.proto && protox amy.proto -o amy.pb && test -s amy.pb"],
  cbindgen: ["cbindgen", "printf '#[no_mangle]\\npub extern \"C\" fn answer() -> i32 { 42 }\\n' > /tmp/amy-answer.rs && cbindgen /tmp/amy-answer.rs | grep -q 'int32_t answer'"],
  "pi-coding-agent": ["pi", "pi --version > /dev/null && ! cc --version 2> /dev/null"],
  // The two ways its manual page gives: a function for a C program, and a program with the standard library.
  zig: ["zig", "mkdir /tmp/amy-zig && cd /tmp/amy-zig && printf 'export fn answer() c_int { return 42; }\\n' > answer.zig && " +
    "printf 'int answer(void); int main(void) { return answer(); }\\n' > main.c && zig build-obj -ofmt=c -femit-bin=answer.c answer.zig && " +
    "cc -I /usr/lib/zig main.c answer.c -o answer && man zig > /dev/null && ./answer; test $? = 42 && " +
    "printf 'const std = @import(\"std\");\\npub fn main() void { std.debug.print(\"{d}\", .{6 * 7}); }\\n' > hello.zig && " +
    "zig build-exe -target wasm64-emscripten -fsingle-threaded -ofmt=c -lc -femit-bin=hello.c hello.zig && " +
    "cc -Wno-incompatible-pointer-types '-Dzig_unimplemented()=(__builtin_trap(),0)' -I /usr/lib/zig hello.c -o hello && test \"$(./hello 2>&1)\" = 42"],
};
await browserTest("amy tools", { image: "default", timeout: 300_000 }, async ({ open }) => {
  const session = await open(), run = check(session);
  for (const [name, [command, use]] of Object.entries(tools)) {
    await run(`! command -v ${command}`);
    console.log(`amy install ${name}: ${await timed(run, `amy install ${name}`)} ms`);
    await run(use);
  }
  await run("amy install dolly-docs && test -f /usr/share/doc/dolly/docs/dollyfile.md");
  await run("amy install transfer && amy files transfer | grep -q ' /bin/upload$' && download --help | grep -q '^usage: download'");
});

// Every package of the catalog is installed into default and used: by a case
// of this file, or where this says.
const elsewhere = {
  git: "man-browser.mjs, pager-browser.mjs", less: "pager-browser.mjs", llvm: "demos/llvm",
  parakeet: "demos/speech", transcribe: "demos/speech: default refuses it", voice: "demos/speech, in pi-phone",
  tmux: "demos/tmux: default refuses it",
  "llvm-runtimes": "a build stage", "minicpm5-2b": "demos/local-llm", "qwen3.5-2b": "demos/local-llm",
  ...Object.fromEntries([1, 2, 3, 4].map(shard => [`qwen3.5-4b-${shard}`, "demos/local-llm"])),
};
const used = new Set([...preinstalled, "python", "cargo", "mojo-compiler", "dolly-docs", "transfer", ...Object.keys({ ...programs, ...tools, ...elsewhere })]);
assert.deepEqual(packages.filter(name => !used.has(name)), [], "packages that no test installs and uses");

// A package brings the programs its own programs start. rustc links through
// cc, which default lacks: installed alone, rust links a program and cargo
// builds a crate. (A package's environment applies from the next session
// load, so the build names what the cargo package exports.)
const crate = "mkdir -p /tmp/amy-crate/src && cd /tmp/amy-crate && " +
  "printf '[package]\\nname = \"amy-crate\"\\nversion = \"0.1.0\"\\nedition = \"2021\"\\n' > Cargo.toml && " +
  "printf 'fn main() { println!(\"{}\", 6 * 7); }\\n' > src/main.rs && " +
  "CARGO_INCREMENTAL=0 cargo build --offline && test \"$(target/debug/amy-crate)\" = 42";
// cmake configures with the C compiler and builds with make, which the cmake
// package installs with cc.
// mojo build links what it compiles through cc.
const hello = "mkdir /tmp/amy-mojo && cd /tmp/amy-mojo && printf 'def main():\\n    print(\"hello\", 6 * 7)\\n' > hello.mojo && " +
  "mojo build hello.mojo && test \"$(./hello)\" = 'hello 42'";
for (const [name, command, program] of [["rust", "rustc", programs.rust], ["cargo", "cargo", crate], ["cmake", "cmake", programs.cmake],
  ["mojo-compiler", "mojo", hello]]) {
  await browserTest(`amy ${name} alone`, { image: "default", timeout: 300_000 }, async ({ open }) => {
    const run = check(await open());
    await run(`! cc --version 2> /dev/null && ! command -v ${command}`);
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
