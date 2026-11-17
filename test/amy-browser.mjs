import assert from "node:assert/strict";
import { sha256 } from "../scripts/sha256.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest, composed, put, putFixture } from "./browser.mjs";
import { eachSession, installs, typing } from "./amy-sessions.mjs";
import { encodeSnapshotRecords } from "../page/snapshot-records.mjs";
import { siteReference } from "../page/static-asset.mjs";
import { inspectDollyfile, recipeRows } from "../site/dollyfile-view.mjs";
import catalog from "../dist/dolly-images.json" with { type: "json" };
import programCases from "./cases/amy-programs.json" with { type: "json" };
import toolCases from "./cases/amy-tools.json" with { type: "json" };

const packages = catalog.images.filter(definition => definition.role === "package").map(({ image }) => image).sort();
// The core's, of a recipe at the top level: a demo's packages are its demo's own.
const corePackages = catalog.images.filter(definition => definition.role === "package" && !definition.dollyfile.includes("/"))
  .map(({ image }) => image).sort();
// The packages default's recipe installs, and those they install (amy's dollyfile).
const preinstalled = [...new Set(catalog.images.find(definition => definition.image === "default").artifacts
  .filter(artifact => artifact.operation === "install").map(artifact => artifact.image))].sort();
// The site's index, as generated: NAME RECIPE SHA256 DESCRIPTION.
const index = await readFile(new URL("../amy-index.txt", import.meta.url), "utf8");
const indexed = name => index.split("\n").find(row => row.startsWith(`${name} `)).split(" ");
const pin = name => {
  const { dollyfile, sha256 } = catalog.images.find(definition => definition.image === name);
  return `${siteReference(dollyfile)} ${sha256}`;
};

// A sealed package that needs sockets@0, as the engine would build it: the
// retained recipe plus its receipt (recipe chain, host requirements, exports).
const encoder = new TextEncoder();
const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; };
const text = value => [u32(encoder.encode(value).length), encoder.encode(value)];
const connects = { url: siteReference("Dollyfile-connects"),
  source: "DOLLY 8\nPACKAGE connects\nREQUIRES HOST runtime@0\nREQUIRES HOST sockets@0\nFILE /usr/share/connects\n    needs sockets\n" };
connects.sha256 = sha256(connects.source);
const receipt = [encoder.encode("DOLLYART"), u32(5), u32(1),
  ...["PACKAGE", "connects", connects.url, connects.sha256, connects.source].flatMap(text),
  u32(1), ...text("sockets@0"), u32(1), ...text("FILE"), ...text("connects"), ...text("/usr/share/connects"), u32(1),
  ...text("/usr/share/connects")];
const bytes = parts => { const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; } return joined; };
const file = data => ({ kind: 2, data: encoder.encode(data) });
const snapshot = encodeSnapshotRecords(new Map([["/etc/dolly/Dollyfile", file(connects.source)],
  ["/etc/dolly/artifact", { kind: 2, data: bytes(receipt) }], ["/usr/share/connects", file("needs sockets\n")]]));
const scratch = await mkdtemp(join(tmpdir(), "dolly-amy-"));
await writeFile(join(scratch, "connects.snapshot"), snapshot);
const fixtures = { "connects.snapshot": join(scratch, "connects.snapshot") };
// Sealed packages of one file, /usr/share/NAME, as the engine would build
// them. `needed` are the packages the recipe installs: its INSTALL rows, which
// the snapshot records and does not hold. `hosts` are its host modules,
// `environment` the variables it exports.
async function sealed(name, body, needed = [], hosts = [], environment = {}) {
  const url = siteReference(`Dollyfile-${name}`), rows = needed.map(({ url, sha256 }) => `INSTALL ${url} ${sha256}\n`).join("");
  const variables = Object.entries(environment);
  const source = `DOLLY 8\nPACKAGE ${name}\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}${rows}FILE /usr/share/${name}\n    ${body}\n` +
    variables.map(([variable, value]) => `EXPORTS ENV ${variable} ${value}\n`).join("");
  const pin = sha256(source), chain = [...needed, { name, url, sha256: pin, source }];
  const receipt = [encoder.encode("DOLLYART"), u32(5), u32(chain.length),
    ...chain.flatMap(recipe => ["PACKAGE", recipe.name, recipe.url, recipe.sha256, recipe.source].flatMap(text)),
    u32(hosts.length), ...hosts.flatMap(text), u32(1 + variables.length), ...text("LIB"), ...text(name), ...text(`/usr/share/${name}`), u32(1),
    ...text(`/usr/share/${name}`), ...variables.flatMap(([variable, value]) => [...text("ENV"), ...text(variable), ...text(value), u32(0)])];
  const records = new Map([["/etc/dolly/Dollyfile", file(source)], ["/etc/dolly/artifact", { kind: 2, data: bytes(receipt) }],
    ...rows ? [["/etc/dolly/installed", file(rows)]] : [], [`/usr/share/${name}`, file(`${body}\n`)]]);
  await writeFile(join(scratch, `${pin}.snapshot`), encodeSnapshotRecords(new Map([...records].sort(([left], [right]) => left < right ? -1 : 1))));
  fixtures[`${pin}.snapshot`] = join(scratch, `${pin}.snapshot`);
  return { name, url, sha256: pin, source };
}
// The same recipe at two pins, a package whose recipe installs the newer, and
// one that also needs two host modules default does not declare.
const [older, newer] = [await sealed("needed", "one"), await sealed("needed", "two")];
const needs = await sealed("needs", "top", [newer]), listens = await sealed("listens", "ears", [newer], ["microphone@0", "gpu@0"]);
// What a package uses to build: a library that needs `newer` and a module the
// building recipe does not declare, and a package that needs `newer` too.
const library = await sealed("library", "lib", [newer], ["microphone@0"], { LIBRARY_BUILT: "used" });
const shared = await sealed("shared", "also", [newer]);
const artifact = `/etc/dolly/artifacts/${connects.sha256}.snapshot`;
const row = `INSTALL ${connects.url} ${connects.sha256}`;
const check = ({ submit, text }) => async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
// While set, the site answers with this index, as after a newer release.
const site = { index: null };
// Another image directory: the checkout's catalog, packs and index again under
// /mirror/, which records what it served and what it served to a request with cookies.
const mirror = { served: [], cookies: [] };
async function handle(request, response, path, headers) {
  const file = path.startsWith("/mirror/") ? path.slice("/mirror/".length) : null;
  if (file !== null && /^(?:amy-index\.txt|dist\/[\w.-]+(?:\/[\w.-]+)?)$/.test(file)) {
    const bytes = await readFile(new URL(`../${file}`, import.meta.url)).catch(() => null);
    if (bytes === null) return false;
    mirror.served.push(file);
    if (request.headers.cookie !== undefined) mirror.cookies.push(file);
    response.writeHead(200, { ...headers, "content-type": file.endsWith(".json") ? "application/json" : "application/octet-stream" }).end(bytes);
    return true;
  }
  if (path !== "/amy-index.txt" || site.index === null) return false;
  response.writeHead(200, { ...headers, "content-type": "text/plain; charset=utf-8" }).end(site.index);
  return true;
}
const timed = async (run, command) => { const started = performance.now(); await run(command); return Math.round(performance.now() - started); };

// amy in a live default session: the index is the page's directory's, which
// packages@0 hands over without an HTTP rule, an install is the INSTALL row
// executed by the engine, served by packages@0, recorded, and kept by a saved session.
try {
await browserTest("amy", { image: "default", timeout: 300_000, server: { fixtures, handle } }, async ({ server, open }) => {
  const policy = { maxRequests: 512, rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
    { origin: server.origin, pathPrefix: "/mirror/", methods: ["GET"] }] };
  const session = await open({ policy });
  const run = check(session);
  await run(`test "$(amy list | sed 's/ .*//' | sort | tr '\\n' ' ')" = "${packages.join(" ")} "`);
  // The record lists what the image's recipes installed, before the session adds to it.
  await run(`test "$(amy list | awk '$2 == "installed" { print $1 }' | tr '\\n' ' ')" = '${preinstalled.join(" ")} '`);
  // Each row carries the index's description and the INSTALL row a recipe writes.
  const [, psUrl, psPin, ...words] = indexed("ps");
  // The description may hold an apostrophe, which ends the shell's quotes.
  const description = words.join(" ").replaceAll("'", "'\\''");
  await run(`test "$(amy info ps)" = "$(printf '%s\\n' 'ps: ${description}' 'INSTALL ${psUrl} ${psPin}' installed)"`);
  await run(`amy list | grep -q '^ps  *installed  *${description}$'`);
  // The files of a package the image installed are the record its build left, sizes included.
  await run("amy files ps > /tmp/ps-files && grep -q ' /bin/ps$' /tmp/ps-files && ! grep -q ' /etc/dolly/' /tmp/ps-files");
  await run("while read size path; do test \"$(stat -c %s \"$path\")\" = \"$size\" || exit 1; done < /tmp/ps-files");
  // A package not installed has no record, and nothing is fetched for it.
  const absent = packages.find(name => !preinstalled.includes(name));
  await run(`! amy files ${absent} 2> /tmp/amy-error && grep -q ${absent} /tmp/amy-error && test ! -e /etc/dolly/artifacts`);
  await run("test \"$(amy install ps)\" = 'amy: ps is already installed'");
  await run("! amy install nosuch-package 2> /tmp/amy-error && grep -q nosuch-package /tmp/amy-error");
  await run("! amy 2> /dev/null && ! amy frobnicate 2> /dev/null");
  // default holds no HTTP client and declares no http@0: installing curl has
  // nena enable it, and the session fetches the fixtures below with it.
  assert.ok(!(await session.page.evaluate(() => __dolly.hostModules)).includes("http@0"));
  await run(`amy install curl && curl -fsS ${server.origin}/fixture/connects.snapshot -o /dev/null`);
  assert.ok((await session.page.evaluate(() => __dolly.hostModules)).includes("http@0"));
  // Two amy commands and a list at once take turns, a command at a time:
  // zig installs cc, which the other installs too.
  console.log(`amy install zig: ${await timed(run, "amy install zig > /tmp/amy-zig & z=$!; amy install cc > /dev/null & c=$!; " +
    "amy list > /tmp/amy-listed && wait $z && wait $c && grep -q '^zig ' /tmp/amy-listed")} ms`);
  await run("test -x /usr/bin/zig");
  // The install says what it added and keeps the list: no index or service is needed to read it.
  await run("grep -q '^amy: zig installed: [1-9][0-9]* files, [1-9][0-9]* bytes, commands:.* zig' /tmp/amy-zig");
  await run("test \"$(amy files zig | wc -l)\" -eq \"$(sed -n 's/^amy: zig installed: \\([0-9]*\\) files.*/\\1/p' /tmp/amy-zig)\"");
  await run("amy files zig | grep ' /usr/bin/zig$' | { read size path; test \"$(stat -c %s \"$path\")\" = \"$size\"; }");
  await run(`amy installed | grep -qx "zig ${pin("zig")}" && grep -qx 'INSTALL ${pin("zig")}' /etc/dolly/installed`);
  await run("amy list | grep -q '^zig  *installed ' && test \"$(amy install zig)\" = 'amy: zig is already installed'");
  // A package's control files describe the package; the session keeps the image's.
  await run("test \"$(cat /etc/dolly/image)\" = default && grep -q '^APPLICATION default' /etc/dolly/Dollyfile");
  // The site's index describes its newest release. A row this tab's release
  // does not publish fails by name and installs nothing.
  site.index = `gzip ${indexed("gzip")[1]} ${"0".repeat(64)} from a newer release\n`;
  assert.notEqual(await session.submit("amy install gzip 2> /tmp/amy-stale"), 0);
  await run("grep -q '^amy: gzip: ' /tmp/amy-stale && ! amy installed | grep -q '^gzip '");
  site.index = null;
  // The server is the page's image directory until the session names another,
  // which the page reads only where its HTTP policy admits it.
  await run(`test "$(amy server)" = '${server.origin}/'`);
  const elsewhere = `${server.origin}/elsewhere/`;
  await run(`amy server ${elsewhere.slice(0, -1)} && test "$(amy server)" = '${elsewhere}'`);
  assert.notEqual(await session.submit("amy list 2> /tmp/amy-elsewhere"), 0);
  await run(`grep -qF '${elsewhere}amy-index.txt' /tmp/amy-elsewhere`);
  await run(`amy server ${server.origin}/mirror/ && amy install gzip > /tmp/amy-gzip && amy installed | grep -q '^gzip '`);
  assert.ok(["amy-index.txt", "dist/dolly-images.json", "dist/dolly-gzip-system-snapshot.json"].every(file => mirror.served.includes(file)),
    mirror.served.join(" "));
  await run(`rm /etc/dolly/packages-server && test "$(amy server)" = '${server.origin}/'`);
  // An install is the engine's INSTALL row: a package whose host modules the
  // session has, sockets@0 enabled here, installs and is recorded, so amy lists it.
  await run(`mkdir -p /etc/dolly/artifacts && curl -fsS ${server.origin}/fixture/connects.snapshot -o ${artifact}`);
  await run(`nena enable sockets && dollyfile install ${connects.url} ${connects.sha256} && test ! -e ${artifact}`);
  await run(`test "$(cat /usr/share/connects)" = 'needs sockets' && grep -qx '${row}' /etc/dolly/installed`);
  await run("test \"$(amy files connects)\" = '14 /usr/share/connects'");
  await run(`test "$(amy installed | tail -n 1)" = "connects ${connects.url} ${connects.sha256}"`);
  // A package names the packages its recipe installs and holds none of their
  // files: the engine installs those rows first, each from its own snapshot.
  // Without a row's snapshot it ends with 3 and changes nothing: amy then
  // installs the row and asks again.
  const place = ({ sha256 }) => `curl -fsS ${server.origin}/fixture/${sha256}.snapshot -o /etc/dolly/artifacts/${sha256}.snapshot`;
  const install = ({ url, sha256 }) => `dollyfile install ${url} ${sha256}`;
  await run(`mkdir -p /etc/dolly/artifacts && ${place(needs)}`);
  assert.equal(await session.submit(install(needs)), 3);
  await run("test ! -e /usr/share/needs && ! grep -q Dollyfile-need /etc/dolly/installed");
  // A package the image may not hold is refused before any of its rows is
  // installed, naming every module it lacks and the one command that adds them.
  await run(`${place(newer)} && ${place(listens)}`);
  assert.equal(await session.submit(`${install(listens)} 2> /tmp/refused`), 2);
  await run("grep -q 'Dollyfile-listens needs microphone@0 and gpu@0: nena enable microphone gpu$' /tmp/refused");
  await run("test ! -e /usr/share/needed && test ! -e /usr/share/listens && ! grep -q Dollyfile-need /etc/dolly/installed");
  await run(`${install(needs)} && test "$(cat /usr/share/needed)" = two && test "$(cat /usr/share/needs)" = top`);
  await run(`test "$(grep Dollyfile-need /etc/dolly/installed | tr '\\n' ' ')" = 'INSTALL ${newer.url} ${newer.sha256} INSTALL ${needs.url} ${needs.sha256} '`);
  // A row the record holds is not installed again: the file changed since stays.
  // The install above consumed the artifact, so the second install gets its own.
  await run(`${place(needs)} && echo kept > /usr/share/needed && ${install(needs)} && test "$(cat /usr/share/needed)" = kept`);
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
  await run("test -x /usr/bin/zig && test \"$ZIG_LIB_DIR\" = /usr/lib/zig && test \"$CC\" = cc");
  await run(`amy installed | grep -qx "zig ${pin("zig")}" && test "$(cat /usr/share/connects)" = 'needs sockets'`);
  await run(`test "$(cat /usr/share/needs)" = top && amy installed | grep -qx "needed ${newer.url} ${newer.sha256}"`);
});

// Another directory comes over packages@0's channel too, in an image without
// http@0: each of its files is read as the guest's own GETs are, judged by the
// page's HTTP policy and counted, without the cookies of the page's origin, and
// none of its packs is kept in the page's store.
await browserTest("amy another directory", { image: "default", server: { handle } }, async ({ server, open }) => {
  const requests = directory => [...server.requests].filter(([path]) => path.startsWith(`/${directory}/`))
    .reduce((sum, [, count]) => sum + count, 0);
  const rules = [{ origin: server.origin, path: "/exact/", methods: ["GET"] },
    { origin: server.origin, pathPrefix: "/mirror/", methods: ["GET"] }];
  const session = await open({ policy: { rules },
    setup: page => page.context().addCookies([{ name: "probe", value: "page-cookie", url: server.origin }]) });
  const run = check(session);
  assert.ok(!(await session.page.evaluate(() => __dolly.hostModules)).includes("http@0"));
  // A rule for the directory's own URL admits none of its files: the index is refused.
  await run(`amy server ${server.origin}/exact/ && ! amy list 2> /tmp/refused && grep -q "policy does not admit" /tmp/refused`);
  assert.equal(requests("exact"), 0);
  // One for all of them admits the package, read without the page's cookie.
  await run(`amy server ${server.origin}/mirror/ && amy install less && less --version > /dev/null`);
  assert.deepEqual(mirror.cookies, []);
  const records = await session.page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("dolly-packs");
    const directories = [];
    for await (const handle of (await root.getDirectoryHandle("images")).values())
      directories.push(JSON.parse(await (await handle.getFile()).text()).directory);
    return directories;
  });
  assert.ok(records.every(directory => !directory.includes("/mirror/")), records.join(" "));
  // Each file is a request of the page's quota: two hold no package.
  const counted = await open({ policy: { maxRequests: 2, rules } }), before = requests("mirror");
  assert.equal(await counted.submit(`amy server ${server.origin}/mirror/ && amy install less`), 1);
  assert.ok(requests("mirror") - before <= 2);
});

// The core's packages in default sessions (test/cases/amy-*.json); a demo's are
// its own (its test/amy-cases.json, and packages.test.mjs of the demos).
await browserTest("amy programs", { image: programCases.image, timeout: 900_000 }, ({ open }) =>
  eachSession(open, programCases));
// vi at the terminal, as typed (typing in amy-sessions.mjs).
const vi = ["vi /tmp/amy-vi", [[/^~$/m, "ione\ntwo\x1b:wq\n"]], "test \"$(tr '\\n' ' ' < /tmp/amy-vi)\" = 'one two '"];
await browserTest("amy tools", { image: toolCases.image, timeout: 900_000 }, ({ open }) =>
  eachSession(open, toolCases, { vi: typing(vi) }));

// Every package of the core is installed into default and used: by a case of
// this file, or where this says.
const elsewhere = {
  git: "man-browser.mjs, pager-browser.mjs", "git-http": "network-browser.mjs, shell-browser.mjs", curl: "the amy session above and nena-browser.mjs, with the http@0 it needs",
  less: "pager-browser.mjs",
  "libdolly-audio": "audio-browser.mjs",
  "libdolly-gpu": "gpu-render-browser.mjs",
  "libdolly-microphone": "microphone-browser.mjs",
  "libdolly-sockets": "sockets-browser.mjs",
  "libdolly-touch": "touch-browser.mjs",
  "libdolly-clipboard": "clipboard-browser.mjs",
  "stack-wrap": "stack-browser.mjs",
  "libdolly-display": "system installs it",
  "libdolly-input": "system installs it",
  "libdolly-download": "system installs it",
  "libdolly-upload": "system installs it",
  "libdolly-threads": "system installs it",
  "libdolly-nena": "nena's build uses it",
  "libdolly-packages": "amy's build uses it",
  "libdolly-pty": "pty-browser.mjs",
  html: "html-browser.mjs",
};
const used = new Set([...preinstalled, ...[programCases, toolCases].flatMap(({ steps }) => steps.flatMap(({ script }) => installs(script))),
  ...Object.keys(elsewhere)]);
assert.deepEqual(corePackages.filter(name => !used.has(name)), [], "packages of the core that no test installs and uses");

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

// Past the snapshots a page load gives, amy says that a reload gives more:
// the page's quota is 2 here.
const transport = await readFile(new URL("../host/packages/transport.mjs", import.meta.url), "utf8");
assert.equal(transport.split("maxSnapshots = 1024").length, 2, "one quota in transport.mjs");
const sourceOverrides = new Map([["/host/packages/transport.mjs", transport.replace("maxSnapshots = 1024", "maxSnapshots = 2")]]);
await browserTest("amy quota", { image: "default", server: { sourceOverrides } }, async ({ open }) => {
  const session = await open();
  assert.equal(await session.submit("amy install gzip && amy install bc"), 0, await session.text());
  assert.notEqual(await session.submit("amy install xxd 2> /tmp/refused"), 0);
  assert.equal(await session.submit("grep -q 'xxd: .*reload' /tmp/refused && ! command -v xxd"), 0, await session.text());
});

// An image built from an uploaded recipe names its root FILE:/path in its
// record, and amy installs into it.
await browserTest("amy in an uploaded recipe's image", { image: "default", timeout: 300_000 }, async ({ open }) => {
  const run = check(await open(await composed(["runtime", "display", "input", "packages", "nena"],
    ["core", "posix", "display", "amy"])));
  await run("amy install less && amy files less | grep -q ' /usr/bin/less$'");
});

// An image that does not declare a package's host module refuses it, naming
// the module and an image that can enable it, before any file changes.
await browserTest("amy refusal", { image: "system" }, async ({ open }) => {
  const system = await open();
  const refuse = async command => assert.equal(await system.submit(command), 0, `${command}\n${await system.text()}`);
  await put(system.submit, artifact, await readFile(fixtures["connects.snapshot"]));
  assert.equal(await system.submit(`dollyfile install ${connects.url} ${connects.sha256} 2> /tmp/refused`), 2);
  await refuse("grep -q 'Dollyfile-connects needs sockets@0.* default$' /tmp/refused");
  await put(system.submit, `/etc/dolly/artifacts/${listens.sha256}.snapshot`, await readFile(fixtures[`${listens.sha256}.snapshot`]));
  assert.equal(await system.submit(`dollyfile install ${listens.url} ${listens.sha256} 2> /tmp/refused`), 2);
  await refuse("grep -q 'Dollyfile-listens needs microphone@0 and gpu@0.* default$' /tmp/refused");
  await refuse("test ! -e /usr/share/connects && ! grep -q connects /etc/dolly/installed");
});

// USE, by the engine built from this checkout: the library and the row it
// needs are restored for the build and kept by nothing; an INSTALL after it
// skips the used row, whose snapshot has gone, and records it. The engine's
// sources, the snapshots, the recipe and the rows the page would give the
// engine are written by the shell.
await browserTest("USE", { image: "system" }, async ({ open }) => {
  const system = await open();
  const run = check(system);
  for (const [name, path] of Object.entries({ "dollyfile.c": "programs/dollyfile.c", "sha256.h": "programs/sha256.h", "fs-record.h": "kernel/fs-record.h" }))
    await putFixture(system.submit, `/tmp/use/${name}`, path);
  await run("cd /tmp/use && cc -O0 dollyfile.c -o dollyfile");
  await run("touch /etc/dolly/installed && cp /etc/dolly/installed record && mkdir -p /etc/dolly/artifacts");
  const row = ({ url, sha256 }) => `${url} ${sha256}`;
  const build = async (rows, fails = false) => {
    await run("cp record /etc/dolly/installed");
    for (const { sha256 } of [library, shared, newer, ...rows.some(item => item.includes(older.sha256)) ? [older] : []])
      await put(system.submit, `/etc/dolly/artifacts/${sha256}.snapshot`, await readFile(fixtures[`${sha256}.snapshot`]));
    const source = ["DOLLY 8", "PACKAGE uses", "REQUIRES HOST runtime@0", ...rows].map(line => `${line}\n`).join("");
    await put(system.submit, "/tmp/use/Dollyfile-uses", encoder.encode(source));
    await put(system.submit, "/etc/dolly/recipe.rows", encoder.encode(recipeRows(inspectDollyfile(source), sha256(source))));
    assert.equal(await system.submit("./dollyfile FILE:/tmp/use/Dollyfile-uses > log 2>&1") !== 0, fails, await system.text());
  };
  const used = `USE ${row(library)}`, installed = `INSTALL ${row(shared)}`;
  const recorded = "grep '^INSTALL ' /etc/dolly/installed | grep -v -x -f record | sed 's/ [0-9a-f]*$//' | tr '\\n' ' '";
  const kept = `test "$(${recorded})" = 'INSTALL ${newer.url} INSTALL ${shared.url} ' && ! grep -q /usr/share/library /etc/dolly/image.manifest && ` +
    "! grep -q LIBRARY_BUILT /etc/dolly/environment && test -z \"$(ls /etc/dolly/artifacts)\"";
  await build([used, "REQUIRES LIB library", 'SLOP test "$LIBRARY_BUILT" = used && test "$(cat /usr/share/needed)" = two', installed]);
  await run(kept);
  await build([installed, used]);
  await run(kept);
  // A build holds a recipe at one pin: a row used at one and installed at another fails, naming it.
  await build([used, `INSTALL ${row(older)}`], true);
  await run(`grep -q '${older.url} is in this build at another pin' log`);
});
} finally {
  await rm(scratch, { recursive: true, force: true });
}
