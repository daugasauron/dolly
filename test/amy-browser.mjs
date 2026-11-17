import assert from "node:assert/strict";
import { sha256 } from "../scripts/sha256.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest, runSteps } from "./browser.mjs";
import { encodeSnapshotRecords } from "../page/snapshot-records.mjs";
import { siteReference } from "../page/static-asset.mjs";
import { inspectDollyfile, recipeRows } from "../site/dollyfile-view.mjs";
import catalog from "../dist/dolly-images.json" with { type: "json" };
import programCases from "./cases/amy-programs.json" with { type: "json" };
import toolCases from "./cases/amy-tools.json" with { type: "json" };

const packages = catalog.images.filter(definition => definition.role === "package").map(({ image }) => image).sort();
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
  source: "DOLLY 7\nPACKAGE connects\nREQUIRES HOST runtime@0\nREQUIRES HOST sockets@0\nFILE /usr/share/connects\n    needs sockets\n" };
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
  const source = `DOLLY 7\nPACKAGE ${name}\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}${rows}FILE /usr/share/${name}\n    ${body}\n` +
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
Object.assign(fixtures, { "dollyfile.c": "programs/dollyfile.c", "sha256.h": "programs/sha256.h", "fs-record.h": "kernel/fs-record.h" });
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
  const [, curlUrl, curlPin, ...words] = indexed("curl");
  // The description may hold an apostrophe, which ends the shell's quotes.
  const description = words.join(" ").replaceAll("'", "'\\''");
  await run(`test "$(amy info curl)" = "$(printf '%s\\n' 'curl: ${description}' 'INSTALL ${curlUrl} ${curlPin}' installed)"`);
  await run(`amy list | grep -q '^curl  *installed  *${description}$'`);
  // The files of a package the image installed are the record its build left, sizes included.
  await run("amy files curl > /tmp/curl-files && grep -q ' /usr/bin/curl$' /tmp/curl-files && ! grep -q ' /etc/dolly/' /tmp/curl-files");
  await run("while read size path; do test \"$(stat -c %s \"$path\")\" = \"$size\" || exit 1; done < /tmp/curl-files");
  // A package not installed has no record, and nothing is fetched for it.
  const absent = packages.find(name => !preinstalled.includes(name));
  await run(`! amy files ${absent} 2> /tmp/amy-error && grep -q ${absent} /tmp/amy-error && test ! -e /etc/dolly/artifacts`);
  await run("test \"$(amy install curl)\" = 'amy: curl is already installed'");
  await run("! amy install nosuch-package 2> /tmp/amy-error && grep -q nosuch-package /tmp/amy-error");
  await run("! amy 2> /dev/null && ! amy frobnicate 2> /dev/null");
  // A pin the directory does not publish is a 404.
  await run("d=$(curl -fsS https://packages.dolly.invalid/v1/directory | sed 's/:/%3A/g; s|/|%2F|g') && " +
    "test \"$(curl -s -o /dev/null -w '%{http_code}' https://packages.dolly.invalid/v1/packages/$(printf '%064d' 0)/from/$d)\" = 404");
  // Two amy commands and a list at once take turns, a command at a time:
  // python installs cc, which the other installs too.
  console.log(`amy install python: ${await timed(run, "amy install python > /tmp/amy-python & p=$!; amy install cc > /dev/null & c=$!; " +
    "amy list > /tmp/amy-listed && wait $p && wait $c && grep -q '^python ' /tmp/amy-listed")} ms`);
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
  // The server is the page's image directory until the session names another,
  // which the page reads only where its HTTP policy admits it.
  await run(`test "$(amy server)" = '${server.origin}/'`);
  const elsewhere = `${server.origin}/elsewhere/`;
  await run(`amy server ${elsewhere.slice(0, -1)} && test "$(amy server)" = '${elsewhere}'`);
  assert.notEqual(await session.submit("amy list 2> /tmp/amy-elsewhere"), 0);
  await run(`grep -qF '${elsewhere}amy-index.txt' /tmp/amy-elsewhere`);
  assert.notEqual(await session.submit(`curl -fsS https://packages.dolly.invalid/v1/packages/${indexed("gzip")[2]}/from/${encodeURIComponent(elsewhere)} -o /dev/null`), 0);
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
  await run("test \"$(python3 -c 'print(6 * 7)')\" = 42 && test \"$PYTHONUTF8\" = 1 && test \"$PYTHONDONTWRITEBYTECODE\" = 1");
  await run(`amy installed | grep -qx "python ${pin("python")}" && test "$(cat /usr/share/connects)" = 'needs sockets'`);
  await run(`test "$(cat /usr/share/needs)" = top && amy installed | grep -qx "needed ${newer.url} ${newer.sha256}"`);
});

// Another directory is read as the guest's own GETs are: each file judged by
// the page's HTTP policy and counted, without the cookies of the page's origin.
await browserTest("amy another directory", { image: "default", server: { handle } }, async ({ server, open }) => {
  const snapshot = directory => "https://packages.dolly.invalid/v1/packages/" +
    `${indexed("less")[2]}/from/${encodeURIComponent(`${server.origin}/${directory}/`)}`;
  const refused = directory => `test "$(curl -s -o /dev/null -w '%{http_code}' ${snapshot(directory)})" = 403`;
  const requests = directory => [...server.requests].filter(([path]) => path.startsWith(`/${directory}/`))
    .reduce((sum, [, count]) => sum + count, 0);
  const rules = [{ origin: server.origin, path: "/exact/", methods: ["GET"] },
    { origin: server.origin, pathPrefix: "/mirror/", methods: ["GET"] }];
  const session = await open({ policy: { rules },
    setup: page => page.context().addCookies([{ name: "probe", value: "page-cookie", url: server.origin }]) });
  // A rule for the directory's own URL admits none of its files; one for all
  // of them admits the package, read without the page's cookie.
  assert.equal(await session.submit(refused("exact")), 0);
  assert.equal(requests("exact"), 0);
  assert.equal(await session.submit(`curl -fsS ${snapshot("mirror")} -o /tmp/less.snapshot`), 0);
  assert.deepEqual(mirror.cookies, []);
  // Each file is a request of the page's quota: two hold no package.
  const counted = await open({ policy: { maxRequests: 2, rules } }), before = requests("mirror");
  assert.equal(await counted.submit(refused("mirror")), 0);
  assert.ok(requests("mirror") - before <= 2);
});

// The packages a step's script installs.
const installs = script => [...script.matchAll(/amy install ([a-z0-9.-]+)/g)].map(([, name]) => name);
// Each package of a case file in a page of its own, four at once: a `fresh`
// step begins a new default session, which installs the package alone (then
// cc and pkgconf where its use compiles), so that a package missing what it
// needs fails. after[NAME](session) is what the page then does in the session
// that installs NAME. Every failing session is reported.
async function eachSession(open, origin, { directory, steps }, after = {}) {
  const sessions = steps.reduce((groups, step) => (step.fresh ? groups.push([step]) : groups.at(-1).push(step), groups), []);
  const failures = [];
  const run = async () => {
    for (let steps; (steps = sessions.shift());) {
      const name = installs(steps.map(({ script }) => script).join("\n"))[0];
      const session = await open();
      try {
        await runSteps(session.submit, origin, { directory, steps });
        await after[name]?.(session);
      } catch (error) {
        console.error(`${name}: ${error.message}`);
        failures.push(name);
      } finally {
        await session.page.context().close();
      }
    }
  };
  await Promise.all([1, 2, 3, 4].map(run));
  assert.deepEqual(failures, []);
}

// default declares no module for a package it does not hold: amy has nena
// enable what each needs, as SDL2's audio@0 and touch@0 (test/cases/amy-programs.json).
const declared = catalog.images.find(definition => definition.image === "default").hostRequirements;
assert.ok(!declared.includes("audio@0") && !declared.includes("touch@0"), declared.join(" "));
await browserTest("amy programs", { image: programCases.image, timeout: 900_000 }, async ({ name, server, open }) => {
  await eachSession(open, server.origin, programCases, { async raylib(session) {
    // The program holds the display, so its line does not show: press Space once it runs.
    const keys = session.submit("/tmp/amy-raylib-keys");
    await session.page.locator("#keyboard").focus();
    await session.page.waitForTimeout(3000);
    await session.page.keyboard.press("Space");
    assert.equal(await keys, 0, await session.text());
    // Two fingers down on raylib's window, then up: CDP's touches in Chromium, a
    // touchscreen's PointerEvents in Firefox, as test/touch-browser.mjs.
    const touches = session.submit("/tmp/amy-raylib-touch");
    await session.page.waitForTimeout(3000);
    const { x, y } = await session.page.locator("#display").boundingBox(), points = [[x + 60, y + 60], [x + 120, y + 60]];
    if (name === "chromium") {
      const cdp = await session.page.context().newCDPSession(session.page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
      await session.page.waitForTimeout(500);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      const fingers = type => session.page.evaluate(([type, points]) => points.forEach(([x, y], id) => document.querySelector("#display").dispatchEvent(
        new PointerEvent(type, { pointerId: 20 + id, pointerType: "touch", isPrimary: id === 0, button: 0, buttons: type === "pointerup" ? 0 : 1,
          pressure: type === "pointerup" ? 0 : 0.5, clientX: x, clientY: y, bubbles: true, cancelable: true }))), [type, points]);
      await fingers("pointerdown");
      await session.page.waitForTimeout(500);
      await fingers("pointerup");
    }
    assert.equal(await touches, 0, await session.text());
  } });
});

// The terminal has no line discipline: a program that reads lines there edits
// them itself. For each package, the command, what the screen shows and what
// is then typed (\n is Enter, \x1b Escape), and what the session then holds.
const typed = {
  sqlite: ["sqlite3 /tmp/amy.db", [[/amy\.db->\s*$/, "select count(*) * 14 from word;\n"], [/\D42\D[^>]*amy\.db->\s*$/, ".quit\n"]]],
  bc: ["dc", [[/>>>\s*$/, "6 7 * p\n"], [/\n42\n>>>\s*$/, "q\n"]]],
  vi: ["vi /tmp/amy-vi", [[/^~$/m, "ione\ntwo\x1b:wq\n"]], "test \"$(tr '\\n' ' ' < /tmp/amy-vi)\" = 'one two '"],
  // Its status line is up; Ctrl+S saves and Ctrl+Q quits.
  dte: ["dte /tmp/amy-dte", [[/INS +UTF-8/, "one\ntwo\x13\x11"]], "test \"$(tr '\\n' ' ' < /tmp/amy-dte)\" = 'one two '"],
};
const typing = ([command, steps, holds = "true"]) => async session => {
  const running = session.submit(command);
  await session.page.locator("#keyboard").focus();
  for (const [shown, keys] of steps) {
    await session.waitForText(shown);
    for (const [index, text] of keys.split("\x1b").entries()) {
      if (index) await session.page.keyboard.press("Escape");
      for (const [control, part] of text.split(/([\x11\x13])/).entries()) {
        if (control % 2) await session.page.keyboard.press(`Control+${String.fromCharCode(part.charCodeAt(0) + 96)}`);
        else await session.page.keyboard.type(part);
      }
    }
  }
  assert.equal(await running, 0, `${command}\n${await session.text()}`);
  assert.equal(await session.submit(holds), 0, holds);
};
await browserTest("amy tools", { image: toolCases.image, timeout: 900_000 }, async ({ server, open }) => {
  await eachSession(open, server.origin, toolCases, Object.fromEntries(Object.entries(typed).map(([name, use]) => [name, typing(use)])));
});

// Every package of the catalog is installed into default and used: by a case
// of this file, or where this says.
const elsewhere = {
  git: "man-browser.mjs, pager-browser.mjs", less: "pager-browser.mjs", llvm: "demos/llvm",
  parakeet: "demos/speech", "speech-to-text": "demos/speech", voice: "demos/speech, in pi-phone",
  tmux: "demos/tmux",
  pi: "the pi-dolly row installs it", secretenv: "demos/closed-source-agent and demos/pi: their key prompts",
  "llvm-runtimes": "a build stage", "llama-cpp": "a build stage: llama links it", "minicpm5-2b": "demos/local-llm", "qwen3.5-2b": "demos/local-llm", "qwen3.5-4b": "demos/local-llm",
  "lfm2.5": "demos/local-llm",
  "libdolly-audio": "audio-browser.mjs", "libdolly-gpu": "gpu-render-browser.mjs",
  "libdolly-microphone": "microphone-browser.mjs", "libdolly-sockets": "sockets-browser.mjs",
  "libdolly-touch": "touch-browser.mjs", "libdolly-clipboard": "clipboard-browser.mjs", "stack-wrap": "stack-browser.mjs",
  "libdolly-display": "system installs it", "libdolly-input": "system installs it", "libdolly-download": "system installs it",
  "libdolly-upload": "system installs it", "libdolly-threads": "system installs it",
  "libdolly-nena": "nena's build uses it", "libdolly-packages": "amy's build uses it", "libdolly-pty": "pty-browser.mjs",
  openblas: "demos/python", numpy: "demos/python", pandas: "demos/python: python-data installs it",
  matplotlib: "demos/python: python-data installs it", seaborn: "demos/python: python-data installs it",
  "python-dateutil": "demos/python: pandas and matplotlib install it", libjpeg: "demos/xonotic", "xonotic-shaders": "demos/xonotic: xonotic-build installs it", spidermonkey: "demos/zero-ad",
  "xorg-server": "demos/x11", "x11-libs": "x11-window installs it", twm: "demos/x11", xclock: "demos/x11", xeyes: "demos/x11", xterm: "demos/x11",
  imgui: "demos/sdl2", "imgui-x11": "demos/x11", llvm22: "demos/zig: zig-llvm uses it", "zig-llvm": "demos/zig",
  ffmpeg: "demos/ffmpeg", zsh: "demos/zsh", binaryen: "demos/zsh: zsh's build uses it", "ghostty-gtk": "demos/ghostty-gtk", ocaml: "demos/ocaml", lean: "demos/lean",
  "lean-std": "demos/lean: lean installs it", "lean-meta": "demos/lean: lean installs it",
  glib: "demos/ghostty-gtk: gtk-build installs it", pcre2: "demos/ghostty-gtk: glib uses it", libffi: "demos/ghostty-gtk: glib uses it",
  go: "demos/go", esbuild: "demos/go", naga: "demos/zero-ad: zero-ad-data uses it", "zero-ad-data": "demos/zero-ad: zero-ad copies it",
  "fingers-build": "demos/fingers: fingers installs it",
  anykey: "demos/closed-source-agent: closed-source-agent installs it", "pi-llm": "demos/local-llm: pi-local installs it",
  "classicube-agent": "demos/classicube: classicube installs it", "seven-kingdoms": "demos/rts: rts-arena installs it",
  "slopyard-game": "demos/slopyard: slopyard installs it", "vendor-crates": "demos/rust/test/vendor-crates-browser.mjs",
  fmt: "demos/zero-ad: zero-ad-deps installs it", libxml2: "demos/zero-ad: zero-ad-deps installs it",
  libsodium: "demos/zero-ad: zero-ad-deps installs it", "boost-headers": "demos/zero-ad: zero-ad-deps installs it",
  premake: "demos/zero-ad: zero-ad-engine's build uses it",
  transcribe: "demos/speech: speech-to-text and voice link it", gmqcc: "demos/xonotic: xonotic-build installs it",
  pixman: "demos/x11: xorg-server links it", libxkbfile: "demos/x11: xorg-server links it", xkbcomp: "demos/x11: xorg-server installs it",
  "xkeyboard-config": "demos/x11: xorg-server installs it",
  godot: "demos/godot", "godot-editor": "demos/godot", "dodge-the-creeps": "demos/godot",
  scons: "demos/godot: godot's build uses it", "spirv-wgsl": "demos/godot: godot's build uses it",
  "truck-town": "demos/godot/test/godot-gpu-browser.mjs", "lantern-drift": "demos/godot/test/godot-gpu-browser.mjs",
  "airtime-godot": "demos/godot/test/godot-gpu-browser.mjs", "voxel-flyover": "demos/godot/test/godot-flyover-browser.mjs",
  photocraft: "demos/photocraft: photocraft-photos installs it", html: "html-browser.mjs", rclone: "demos/rclone",
};
const used = new Set([...preinstalled, "python", ...[programCases, toolCases].flatMap(({ steps }) => steps.flatMap(({ script }) => installs(script))),
  ...Object.keys(elsewhere)]);
assert.deepEqual(packages.filter(name => !used.has(name)), [], "packages that no test installs and uses");

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

// An image that does not declare a package's host module refuses it, naming
// the module and an image that can enable it, before any file changes;
// without packages@0 there is no service.
await browserTest("amy refusal", { image: "system", server: { fixtures } }, async ({ server, open }) => {
  const policy = { maxRequests: 256, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const system = await open({ policy });
  const refuse = async command => assert.equal(await system.submit(command), 0, `${command}\n${await system.text()}`);
  await refuse(`mkdir -p /etc/dolly/artifacts && curl -fsS ${server.origin}/fixture/connects.snapshot -o ${artifact}`);
  assert.equal(await system.submit(`dollyfile install ${connects.url} ${connects.sha256} 2> /tmp/refused`), 2);
  await refuse("grep -q 'Dollyfile-connects needs sockets@0.* default$' /tmp/refused");
  await refuse(`curl -fsS ${server.origin}/fixture/${listens.sha256}.snapshot -o /etc/dolly/artifacts/${listens.sha256}.snapshot`);
  assert.equal(await system.submit(`dollyfile install ${listens.url} ${listens.sha256} 2> /tmp/refused`), 2);
  await refuse("grep -q 'Dollyfile-listens needs microphone@0 and gpu@0.* default$' /tmp/refused");
  await refuse("test ! -e /usr/share/connects && ! grep -q connects /etc/dolly/installed");
  assert.notEqual(await system.submit(`curl -fsS https://packages.dolly.invalid/v1/packages/${indexed("zlib")[2]} -o /dev/null`), 0);
});

// USE, by the engine built from this checkout: the library and the row it
// needs are restored for the build and kept by nothing; an INSTALL after it
// skips the used row, whose snapshot has gone, and records it.
// The recipe the USE test builds, and the rows the page would give the engine.
const uses = new Map();
const serveUses = (request, response, path, headers) =>
  uses.has(path) && (response.writeHead(200, { ...headers, "content-type": "text/plain" }).end(uses.get(path)), true);
await browserTest("USE", { image: "system", server: { fixtures, handle: serveUses } }, async ({ server, open }) => {
  const system = await open({ policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const run = check(system);
  const fetch = names => names.map(name => `curl -fsS ${server.origin}/fixture/${name} -o ${name}`).join(" && ");
  await run(`mkdir /tmp/use && cd /tmp/use && ${fetch(["dollyfile.c", "sha256.h", "fs-record.h"])} && cc -O0 dollyfile.c -o dollyfile`);
  await run("touch /etc/dolly/installed && cp /etc/dolly/installed record && mkdir -p /etc/dolly/artifacts");
  const row = ({ url, sha256 }) => `${url} ${sha256}`;
  const build = async (rows, fails = false) => {
    await run(`cp record /etc/dolly/installed && cd /etc/dolly/artifacts && ${fetch([library, shared, newer,
      ...rows.some(item => item.includes(older.sha256)) ? [older] : []].map(({ sha256 }) => `${sha256}.snapshot`))} && cd /tmp/use`);
    const source = ["DOLLY 7", "PACKAGE uses", "REQUIRES HOST runtime@0", ...rows].map(line => `${line}\n`).join("");
    uses.set("/fixture/uses.Dollyfile", source).set("/fixture/uses.rows", recipeRows(inspectDollyfile(source), sha256(source)));
    await run(`curl -fsS ${server.origin}/fixture/uses.Dollyfile -o Dollyfile-uses && ` +
      `curl -fsS ${server.origin}/fixture/uses.rows -o /etc/dolly/recipe.rows`);
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
