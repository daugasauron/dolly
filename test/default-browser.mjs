// The image people open: a shell, its text tools, curl and amy, and no
// compiler. Its start-up text is printed once and names only packages the
// site publishes. An image composed from packages holds what it installs and
// reaches only the host modules it declares.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest, composed, runSteps } from "./browser.mjs";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
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
  await runSteps(session.submit, server.origin, defaultCases);
});

// INSTALL cc on the base (test/cases/cc-package.json). A FILE under /workspace, where ENTRY
// starts, is part of the image (Pi reads its AGENTS.md there).
await browserTest("composed toolchain", {}, async ({ server, open }) => {
  const session = await open(await composed(ccCases.hosts, ccCases.packages,
    { files: { "/workspace/AGENTS.md": "Kept by the image." } }));
  await check(session)("test \"$(pwd)\" = /workspace && test \"$(cat AGENTS.md)\" = 'Kept by the image.'");
  await runSteps(session.submit, server.origin, ccCases);
});

// A package's recorded dependency (test/cases/zig-package.json).
await browserTest("composed dependency", {}, async ({ server, open }) => {
  const session = await open(await composed(zigCases.hosts, zigCases.packages));
  await runSteps(session.submit, server.origin, zigCases);
});
