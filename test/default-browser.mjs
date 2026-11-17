// The image people open: a shell, its text tools and amy, and no compiler
// and no HTTP client. Its start-up text is printed once and names only packages the
// site publishes. An image composed from packages holds what it installs and
// reaches only the host modules it declares.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { browserTest, composed, runSteps } from "./browser.mjs";
import { siteReference } from "../page/static-asset.mjs";
import { inspectDollyfile } from "../site/dollyfile-view.mjs";
import defaultCases from "./cases/default.json" with { type: "json" };
import ccCases from "./cases/cc-package.json" with { type: "json" };
import zigCases from "./cases/zig-package.json" with { type: "json" };

const recipe = inspectDollyfile(await readFile(new URL("../Dollyfile", import.meta.url), "utf8"));
const welcome = recipe.files.find(({ path }) => path === "/home/dolly/.dollyrc").body;
const published = (await readFile(new URL("../amy-index.txt", import.meta.url), "utf8")).split("\n").map(row => row.split(" ")[0]);

const check = ({ submit, text }) => async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);

// What the image holds is test/cases/default.json; its start-up text and modules are the page's.
await browserTest("default", {}, async ({ server, open }) => {
  const session = await open();
  const run = check(session);
  // The entry prints the text once; a shell started later prints nothing.
  const installs = [...welcome.matchAll(/amy install (\S+)/g)].map(([, name]) => name);
  assert.ok(installs.length > 0 && installs.every(name => published.includes(name)), `the text names ${installs}`);
  const first = /^echo '([^']+)'/m.exec(welcome)[1];
  assert.equal((await session.text()).split(first).length, 2, "the start-up text is on the first screen once");
  // The page enables what the recipe declares, no more (host-modules.test.mjs lists that).
  assert.deepEqual(await session.page.evaluate(() => [...__dolly.hostModules].sort()), recipe.hostRequirements.toSorted());
  await runSteps(session.submit, defaultCases);
});

// INSTALL cc on the base (test/cases/cc-package.json). A FILE under /workspace, where ENTRY
// starts, is part of the image (Pi reads its AGENTS.md there).
await browserTest("composed toolchain", {}, async ({ server, open }) => {
  const session = await open(await composed(ccCases.hosts, ccCases.packages,
    { files: { "/workspace/AGENTS.md": "Kept by the image." } }));
  await check(session)("test \"$(pwd)\" = /workspace && test \"$(cat AGENTS.md)\" = 'Kept by the image.'");
  await runSteps(session.submit, ccCases);
});

// A root recipe that installs the dollyfile package builds with that package's
// engine, as a FROM build with its base's: the page never fetches the compiler seed.
await browserTest("composed with the engine", {}, async ({ open, server }) => {
  server.requests.clear();
  const run = check(await open(await composed(["runtime", "display", "input", "http"], ["core", "dollyfile", "display"])));
  await run("test -x /bin/dollyfile && ! test -e /usr/libexec/dolly/process-bin/compiler");
  assert.ok(![...server.requests.keys()].some(path => path.startsWith("/dist/dolly.data")), "the build fetched the compiler seed");
});

// The engine fetches nothing: the page hands it each SOURCE row's file, the
// directory's own by its catalog size and a URL's under the page's HTTP policy,
// and the engine checks the pin, a wrong one failing at its row.
await browserTest("composed with sources", {}, async ({ open, server }) => {
  // What the test server answers at /fixture/http.txt.
  const fixture = Buffer.from("FETCHED-THROUGH-BROWSER\n");
  const pin = createHash("sha256").update(fixture).digest("hex");
  const source = (location, sha256) => composed(["runtime", "display", "input"], ["core", "display"],
    { rows: [`SOURCE ${location} ${sha256} /usr/share/source`, "FILE /usr/share/source"] });
  const run = check(await open(await source(`${server.origin}/fixture/http.txt`, pin)));
  await run(`test "$(cat /usr/share/source)" = '${fixture.toString().trim()}'`);
  await assert.rejects(open({ prompt: null, ...await source(`${server.origin}/fixture/http.txt`, pin),
    policy: { rules: [{ origin: server.origin, pathPrefix: "/elsewhere/", methods: ["GET"] }] } }),
    /SOURCE http:[^\n]*http\.txt[^\n]*policy denied[\s\S]*SOURCE failed/);
  await assert.rejects(open({ prompt: null, ...await source(siteReference("Dollyfile"), "0".repeat(64)) }),
    /SHA256 mismatch[\s\S]*Dollyfile[^\n]*:\d+: SOURCE failed/);
});

// A package's recorded dependency (test/cases/zig-package.json).
await browserTest("composed dependency", {}, async ({ server, open }) => {
  const session = await open(await composed(zigCases.hosts, zigCases.packages));
  await runSteps(session.submit, zigCases);
});
