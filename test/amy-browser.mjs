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
// Sealed packages of one file, /usr/share/NAME, as the engine would build
// them. `needed` are the packages the recipe installs: its INSTALL rows, which
// the snapshot records and does not hold. `hosts` are its host modules.
async function sealed(name, body, needed = [], hosts = []) {
  const url = siteReference(`Dollyfile-${name}`), rows = needed.map(({ url, sha256 }) => `INSTALL ${url} ${sha256}\n`).join("");
  const source = `DOLLY 7\nPACKAGE ${name}\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}${rows}FILE /usr/share/${name}\n    ${body}\n`;
  const pin = sha256(source), chain = [...needed, { name, url, sha256: pin, source }];
  const receipt = [encoder.encode("DOLLYART"), u32(5), u32(chain.length),
    ...chain.flatMap(recipe => ["PACKAGE", recipe.name, recipe.url, recipe.sha256, recipe.source].flatMap(text)),
    u32(hosts.length), ...hosts.flatMap(text), u32(1), ...text("FILE"), ...text(name), ...text(`/usr/share/${name}`), u32(1), ...text(`/usr/share/${name}`)];
  const records = new Map([["/etc/dolly/Dollyfile", file(source)], ["/etc/dolly/artifact", { kind: 2, data: bytes(receipt) }],
    ...rows ? [["/etc/dolly/installed", file(rows)]] : [], [`/usr/share/${name}`, file(`${body}\n`)]]);
  await writeFile(join(scratch, `${pin}.snapshot`), encodeSnapshotRecords(new Map([...records].sort(([left], [right]) => left < right ? -1 : 1))));
  fixtures[`${pin}.snapshot`] = join(scratch, `${pin}.snapshot`);
  return { name, url, sha256: pin, source };
}
// The same recipe at two pins, a package whose recipe installs the newer, and
// one that also needs a host module default does not declare.
const [older, newer] = [await sealed("needed", "one"), await sealed("needed", "two")];
const needs = await sealed("needs", "top", [newer]), listens = await sealed("listens", "ears", [newer], ["microphone@0"]);
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
  // A package names the packages its recipe installs and holds none of their
  // files: the engine installs those rows first, each from its own snapshot.
  // Without a row's snapshot it ends with 3 and changes nothing: amy then
  // installs the row and asks again.
  const place = ({ sha256 }) => `curl -fsS ${server.origin}/fixture/${sha256}.snapshot -o /etc/dolly/artifacts/${sha256}.snapshot`;
  const install = ({ url, sha256 }) => `dollyfile install ${url} ${sha256}`;
  await run(`mkdir -p /etc/dolly/artifacts && ${place(needs)}`);
  assert.equal(await session.submit(install(needs)), 3);
  await run("test ! -e /usr/share/needs && ! grep -q Dollyfile-need /etc/dolly/installed");
  // A package the image may not hold is refused before any of its rows is installed.
  await run(`${place(newer)} && ${place(listens)}`);
  assert.equal(await session.submit(install(listens)), 2);
  await run("test ! -e /usr/share/needed && test ! -e /usr/share/listens && ! grep -q Dollyfile-need /etc/dolly/installed");
  await run(`${install(needs)} && test "$(cat /usr/share/needed)" = two && test "$(cat /usr/share/needs)" = top`);
  await run(`test "$(grep Dollyfile-need /etc/dolly/installed | tr '\\n' ' ')" = 'INSTALL ${newer.url} ${newer.sha256} INSTALL ${needs.url} ${needs.sha256} '`);
  // A row the record holds is not installed again: the file changed since stays.
  await run(`echo kept > /usr/share/needed && ${install(needs)} && test "$(cat /usr/share/needed)" = kept`);
  // The record holds a recipe at one pin, in a session as in a build: another pin is refused.
  await run(`${place(older)}`);
  assert.equal(await session.submit(install(older)), 2);
  await run(`test "$(cat /usr/share/needed)" = kept && test "$(grep -c Dollyfile-needed /etc/dolly/installed)" = 1 && rm -r /etc/dolly/artifacts`);
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
  await run(`test "$(cat /usr/share/needs)" = top && amy installed | grep -qx "needed ${newer.url} ${newer.sha256}"`);
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
  // codex installs ripgrep and fd: their rows come with it.
  codex: "codex --version | grep -q '^codex-cli ' && fd --version > /dev/null && amy list | grep -q '^ripgrep  *installed '",
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
  // A square wave played from a buffer is in the samples the loopback device renders.
  openal: "printf '%s\\n' '#define AL_ALEXT_PROTOTYPES' '#include <AL/al.h>' '#include <AL/alc.h>' '#include <AL/alext.h>' " +
    "'int main() { ALCdevice *device = alcLoopbackOpenDeviceSOFT(0); " +
    "int format[] = { ALC_FORMAT_CHANNELS_SOFT, ALC_MONO_SOFT, ALC_FORMAT_TYPE_SOFT, ALC_SHORT_SOFT, ALC_FREQUENCY, 48000, 0 }; " +
    "alcMakeContextCurrent(alcCreateContext(device, format)); short wave[4800], heard[4800]; int loud = 0; ALuint buffer, source; " +
    "for (int at = 0; at < 4800; at++) wave[at] = at % 100 < 50 ? 12000 : -12000; alGenBuffers(1, &buffer); alGenSources(1, &source); " +
    "alBufferData(buffer, AL_FORMAT_MONO16, wave, sizeof wave, 48000); alSourcei(source, AL_BUFFER, buffer); alSourcePlay(source); " +
    "alcRenderSamplesSOFT(device, heard, 4800); for (int at = 0; at < 4800; at++) loud += heard[at] > 1000 || heard[at] < -1000; " +
    "return loud < 2400 || alGetError() != AL_NO_ERROR; }' > /tmp/amy-openal.cpp && c++ -O0 /tmp/amy-openal.cpp -lopenal -o /tmp/amy-openal && /tmp/amy-openal",
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

// Checks of the demos/tools packages. A file that NAME packs is smaller and
// unpacks to the same bytes, as a file and through a pipe.
const packs = (pack, unpack, suffix) => `seq 1 20000 > /tmp/amy-${pack} && ${pack} -k /tmp/amy-${pack} && ` +
  `test "$(stat -c %s /tmp/amy-${pack}.${suffix})" -lt "$(stat -c %s /tmp/amy-${pack})" && ` +
  `${unpack} -c /tmp/amy-${pack}.${suffix} | cmp - /tmp/amy-${pack} && ${pack} -c < /tmp/amy-${pack} | ${pack} -dc | cmp - /tmp/amy-${pack}`;
// A program that includes HEADER links LIBRARY, and EXPRESSION is zero in it.
const links = (header, library, expression) => `printf '%s\\n' '#include <${header}.h>' "int main(void) { return ${expression}; }" > /tmp/amy-${header}.c && ` +
  `cc -O0 /tmp/amy-${header}.c -l${library} -o /tmp/amy-${header} && /tmp/amy-${header}`;
// "packed" in the file note, stored.
const zipped = "\\120\\113\\003\\004\\012\\000\\000\\000\\000\\000\\307\\273\\114\\135\\103\\340\\101\\057\\007\\000\\000\\000\\007\\000\\000\\000\\004\\000\\000\\000" +
  "\\156\\157\\164\\145\\160\\141\\143\\153\\145\\144\\012\\120\\113\\001\\002\\036\\003\\012\\000\\000\\000\\000\\000\\307\\273\\114\\135\\103\\340\\101\\057\\007\\000" +
  "\\000\\000\\007\\000\\000\\000\\004\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\264\\201\\000\\000\\000\\000\\156\\157\\164\\145\\120\\113\\005\\006\\000\\000" +
  "\\000\\000\\001\\000\\001\\000\\062\\000\\000\\000\\051\\000\\000\\000\\000\\000";

// What a session adds one package at a time: each command is absent from
// default, installs alone and is used. None brings the compiler until zig,
// which writes C for it.
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
  pi: ["pi", "pi --version > /dev/null && ! cc --version 2> /dev/null"],
  // The two ways its manual page gives: a function for a C program, and a program with the standard library.
  zig: ["zig", "mkdir /tmp/amy-zig && cd /tmp/amy-zig && printf 'export fn answer() c_int { return 42; }\\n' > answer.zig && " +
    "printf 'int answer(void); int main(void) { return answer(); }\\n' > main.c && zig build-obj -ofmt=c -femit-bin=answer.c answer.zig && " +
    "cc -I /usr/lib/zig main.c answer.c -o answer && man zig > /dev/null && ./answer; test $? = 42 && " +
    "printf 'const std = @import(\"std\");\\npub fn main() void { std.debug.print(\"{d}\", .{6 * 7}); }\\n' > hello.zig && " +
    "zig build-exe -target wasm64-emscripten -fsingle-threaded -ofmt=c -lc -femit-bin=hello.c hello.zig && " +
    "cc -Wno-incompatible-pointer-types '-Dzig_unimplemented()=(__builtin_trap(),0)' -I /usr/lib/zig hello.c -o hello && test \"$(./hello 2>&1)\" = 42"],
  // demos/tools. zig brought cc, so a package that holds a library also links a program with it.
  // A database written and queried; a second process is told that the first has it.
  sqlite: ["sqlite3", "sqlite3 /tmp/amy.db \"create table word(n, name); insert into word values (6, 'six'), (7, 'seven'), (9, 'nine'); pragma journal_mode = wal\" > /dev/null && " +
    "test \"$(sqlite3 /tmp/amy.db \"select sum(n) * 3 + 3, json_group_array(name) from word where name like 's%'\")\" = '42|[\"six\",\"seven\"]' && " +
    "sqlite3 /tmp/amy.db 'select count(*) from word' \".shell sqlite3 /tmp/amy.db 'select count(*) from word' 2>&1\" | grep -q 'database is locked' && " +
    links("sqlite3", "sqlite3", "sqlite3_libversion_number() != SQLITE_VERSION_NUMBER") + " && man sqlite3 > /dev/null"],
  // A sum, and a number that a regular expression takes out of a string.
  jq: ["jq", "echo '{\"a\": [1, 20, 21], \"b\": \"x-42\"}' > /tmp/amy.json && " +
    "test \"$(jq -r '(.a | add | tostring) + \" \" + (.b | capture(\"(?<n>[0-9]+)\").n)' /tmp/amy.json)\" = '42 42' && man jq > /dev/null"],
  xz: ["xz", `${packs("xz", "unxz", "xz")} && ${links("lzma", "lzma", "lzma_version_number() != LZMA_VERSION")} && man xz > /dev/null`],
  zstd: ["zstd", `${packs("zstd", "unzstd", "zst")} && ${links("zstd", "zstd", "ZSTD_versionNumber() != ZSTD_VERSION_NUMBER")} && man zstd > /dev/null`],
  bzip2: ["bzip2", `${packs("bzip2", "bunzip2", "bz2")} && ${links("bzlib", "bz2", "BZ2_bzlibVersion()[0] != '1'")} && man bzip2 > /dev/null`],
  lz4: ["lz4", `${packs("lz4", "unlz4", "lz4")} && ${links("lz4", "lz4", "LZ4_versionNumber() != LZ4_VERSION_NUMBER")} && man lz4 > /dev/null`],
  // gzip, earlier in this table, only unpacks: it reads what pigz packs.
  pigz: ["pigz", `${packs("pigz", "unpigz", "gz")} && pigz -c /tmp/amy-pigz | gzip -dc | cmp - /tmp/amy-pigz && man pigz > /dev/null`],
  unzip: ["unzip", `mkdir /tmp/amy-unzip && cd /tmp/amy-unzip && printf '${zipped}' > note.zip && test "$(zipinfo -1 note.zip)" = note && ` +
    "unzip -q note.zip && grep -qx packed note && man unzip > /dev/null"],
  // zip comes with unzip, which zip -T starts.
  zip: ["zip", "mkdir -p /tmp/amy-zip/in/deep /tmp/amy-zip/out && cd /tmp/amy-zip && seq 1 2000 > in/deep/numbers && zip -q -r in.zip in && zip -T in.zip > /dev/null && " +
    "unzip -q in.zip -d out && cmp out/in/deep/numbers in/deep/numbers && test \"$(stat -c %s in.zip)\" -lt \"$(stat -c %s in/deep/numbers)\" && man zip > /dev/null"],
  tree: ["tree", "mkdir -p /tmp/amy-tree/a/b && touch /tmp/amy-tree/a/b/leaf /tmp/amy-tree/top && cd /tmp/amy-tree && " +
    "test \"$(tree --noreport -i -f . | tr '\\n' ' ')\" = '. ./a ./a/b ./a/b/leaf ./top ' && tree -J . | grep -q '\"name\":\"leaf\"' && man tree > /dev/null"],
  bc: ["bc", "test \"$(echo '6 * 7; 2 ^ 64; scale = 20; 4 * a(1)' | bc -l | tr '\\n' ' ')\" = '42 18446744073709551616 3.14159265358979323844 ' && " +
    "test \"$(echo '6 7 * p' | dc)\" = 42 && man bc > /dev/null && man dc > /dev/null"],
  xxd: ["xxd", "test \"$(echo hello | xxd -p)\" = 68656c6c6f0a && seq 1 300 > /tmp/amy-xxd && xxd /tmp/amy-xxd | xxd -r | cmp - /tmp/amy-xxd && man xxd > /dev/null"],
  base64: ["base64", `test "$(echo packed | base64)" = cGFja2VkCg== && seq 1 3000 | base64 > /tmp/amy-base64 && base64 -d /tmp/amy-base64 | tail -n 1 | grep -qx 3000 && ` +
    links("libbase64", "base64", "base64_decode(0, 0, 0, 0, 0) != 1")],
  // A module written from text is valid, reads back and loses its names to
  // wasm-strip; a program cc links here is a module with 64-bit memory.
  wabt: ["wasm2wat", "cd /tmp && echo '(module (func $answer (export \"answer\") (result i32) i32.const 42))' > amy.wat && wat2wasm --debug-names amy.wat -o amy.wasm && " +
    "wasm-validate amy.wasm && wasm2wat amy.wasm | grep -q 'i32.const 42' && wasm-objdump -x amy.wasm | grep -q answer && cp amy.wasm amy-named.wasm && " +
    "wasm-strip amy.wasm && test \"$(stat -c %s amy.wasm)\" -lt \"$(stat -c %s amy-named.wasm)\" && echo 'int main(void) { return 0; }' > amy-wabt.c && " +
    "cc amy-wabt.c -o amy-wabt && wasm-objdump -x amy-wabt | grep -q i64 && man wasm-objdump > /dev/null"],
  // A grammar becomes a parser that counts its tokens, and a scanner counts the numbers it reads. flex comes with yacc.
  yacc: ["yacc", "cd /tmp && printf '%s\\n' '%{' 'int count; int yylex(void); void yyerror(const char *message) {}' '%}' '%token A' '%%' 'list: | list A { count++; };' '%%' " +
    "'#include <stdio.h>' 'int yylex(void) { return getchar() == EOF ? 0 : A; }' 'int main(void) { yyparse(); return count; }' > amy.y && " +
    "yacc -o amy-y.c amy.y && cc amy-y.c -o amy-y; printf abcdef | ./amy-y; test $? = 6 && man yacc > /dev/null"],
  flex: ["flex", "cd /tmp && printf '%s\\n' '%{' 'static int numbers;' '%}' '%%' '[0-9]+ numbers++;' '.|\\n ;' '%%' 'int main(void) { yylex(); return numbers; }' > amy.l && " +
    "flex -o amy-l.c amy.l && cc amy-l.c -lfl -o amy-l; echo 'a 1 bb 22 c 333' | ./amy-l; test $? = 3 && lex --version > /dev/null && man flex > /dev/null"],
  // yes ends when its reader does.
  sbase: ["yes", "test \"$(yes | head -n 3 | tr '\\n' ' ')\" = 'y y y ' && test \"$(printf abc | sha1sum | cut -c 1-40)\" = a9993e364706816aba3e25717850c26c9cd0d89d && " +
    "printf abc | sha512sum | grep -q '^ddaf35a193617aba' && cal 10 2026 | grep -q 2026 && echo sponged > /tmp/amy-sponge && " +
    "tr a-z A-Z < /tmp/amy-sponge | sponge /tmp/amy-sponge && grep -qx SPONGED /tmp/amy-sponge && " +
    "uuencode /tmp/amy-sponge sponge | uudecode -o /tmp/amy-uu && cmp /tmp/amy-uu /tmp/amy-sponge && man yes > /dev/null"],
  // ex edits by commands; vi at the terminal is the step after this table.
  vi: ["vi", "printf 'one\\ntwo\\n' > /tmp/amy-ex && printf '%s\\n' '%s/two/2/' w q | ex -s /tmp/amy-ex > /dev/null && test \"$(tr '\\n' ' ' < /tmp/amy-ex)\" = 'one 2 '"],
};
// The terminal has no line discipline: a program that reads lines there edits
// them itself. For each command, what the screen shows and what is then typed
// (\n is Enter, \x1b Escape); the command ends with status 0.
const typed = {
  "sqlite3 /tmp/amy.db": [[/amy\.db->\s*$/, "select count(*) * 14 from word;\n"], [/\D42\D[^>]*amy\.db->\s*$/, ".quit\n"]],
  dc: [[/>>>\s*$/, "6 7 * p\n"], [/\n42\n>>>\s*$/, "q\n"]],
  "vi /tmp/amy-vi": [[/^~$/m, "ione\ntwo\x1b:wq\n"]],
};
await browserTest("amy tools", { image: "default", timeout: 300_000 }, async ({ open }) => {
  const session = await open(), run = check(session);
  for (const [name, [command, use]] of Object.entries(tools)) {
    await run(`! command -v ${command}`);
    console.log(`amy install ${name}: ${await timed(run, `amy install ${name}`)} ms`);
    await run(use);
  }
  for (const [command, steps] of Object.entries(typed)) {
    const running = session.submit(command);
    await session.page.locator("#keyboard").focus();
    for (const [shown, keys] of steps) {
      await session.waitForText(shown);
      for (const [index, text] of keys.split("\x1b").entries()) {
        if (index) await session.page.keyboard.press("Escape");
        await session.page.keyboard.type(text);
      }
    }
    assert.equal(await running, 0, `${command}\n${await session.text()}`);
  }
  await run("test \"$(tr '\\n' ' ' < /tmp/amy-vi)\" = 'one two '");
  await run("amy install dolly-docs && test -f /usr/share/doc/dolly/docs/dollyfile.md");
  // The core's tar only unpacks files and directories. The tar package puts
  // sbase's in its place: a tree with a link archived, listed and unpacked.
  await run("mkdir -p /tmp/amy-tar/in/deep /tmp/amy-tar/out && cd /tmp/amy-tar && seq 1 2000 > in/deep/numbers && ln -s deep/numbers in/link && ! tar -cf in.tar in 2> /dev/null");
  await run("amy install tar && cd /tmp/amy-tar && tar -cf in.tar in && tar -xf in.tar -C out && cmp out/in/deep/numbers in/deep/numbers && " +
    "test \"$(readlink out/in/link)\" = deep/numbers && tar -cf - in | pigz | gzip -dc | tar -tf - | grep -qx in/link && amy files tar | grep -q ' /usr/share/man/cat1/tar.1$'");
  // dolly-llama computes on the GPU, a host module default does not declare:
  // the package is refused by the module's name and nothing of it is installed.
  assert.notEqual(await session.submit("amy install llama 2> /tmp/refused"), 0);
  await run("grep -q gpu /tmp/refused && ! command -v dolly-llama");
});

// Every package of the catalog is installed into default and used: by a case
// of this file, or where this says.
const elsewhere = {
  git: "man-browser.mjs, pager-browser.mjs", less: "pager-browser.mjs", llvm: "demos/llvm",
  parakeet: "demos/speech", "speech-to-text": "demos/speech: default refuses it", voice: "demos/speech, in pi-phone",
  tmux: "demos/tmux: default refuses it",
  "llvm-runtimes": "a build stage", "minicpm5-2b": "demos/local-llm", "qwen3.5-2b": "demos/local-llm", "qwen3.5-4b": "demos/local-llm",
  ...Object.fromEntries([1, 2, 3, 4].map(shard => [`qwen3.5-4b-${shard}`, "demos/local-llm"])),
};
const used = new Set([...preinstalled, "python", "cargo", "mojo", "dolly-docs", "llama", "tar", "meson", ...Object.keys({ ...programs, ...tools, ...elsewhere })]);
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
// Python runs Meson; meson setup configures with the C compiler and meson
// compile builds with Ninja: the meson package installs the three.
const mesoned = "mkdir /tmp/amy-meson && cd /tmp/amy-meson && printf 'int main(void) { return 42; }\\n' > main.c && " +
  "printf '%s\\n' \"project('probe', 'c')\" \"executable('probe', 'main.c')\" > meson.build && meson setup build && meson compile -C build; build/probe; test $? = 42";
for (const [name, command, program] of [["rust", "rustc", programs.rust], ["cargo", "cargo", crate], ["cmake", "cmake", programs.cmake],
  ["mojo", "mojo", hello], ["meson", "meson", mesoned]]) {
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
  // zig names cc and holds none of it. The session has cc: it is not installed
  // again, so a file of it changed since stays; each package lists its own files.
  await run("echo changed > /usr/share/man/cat1/cc.1");
  console.log(`amy install zig beside cc: ${await timed(run, "amy install zig")} ms`);
  await run("test \"$(cat /usr/share/man/cat1/cc.1)\" = changed && amy files zig | grep -q ' /usr/bin/zig$' && " +
    "! amy files zig | grep -q ' /bin/cc$' && amy files cc | grep -q ' /bin/cc$'");
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
