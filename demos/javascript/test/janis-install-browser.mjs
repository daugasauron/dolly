// janis-install in a default session that amy installs it into, against a
// fixture registry the test origin serves in the registry's place: ranges,
// nesting, integrity, optional and platform packages, scripts that are not
// run, launchers, --prefix, --registry and --integrity, and what it refuses.
// Usage: node demos/javascript/test/janis-install-browser.mjs (DOLLY_BROWSER=firefox runs it in Firefox).
import assert from "node:assert/strict";
import { demoTest, redirectFetch } from "../../browser.mjs";
import { integrities, npmRegistry, registry } from "./fixtures/npm-registry.mjs";

const fixture = npmRegistry("/npm");
const tarballs = () => fixture.requests.filter(({ path }) => path.endsWith(".tgz")).map(({ path }) => path);
const modules = "/usr/lib/node_modules";

await demoTest("janis-install", { image: "default", timeout: 300_000, browser: process.env.DOLLY_BROWSER ?? "chromium",
  server: { handle: fixture.handle } }, async ({ server, open }) => {
  const policy = { maxRequests: 256, rules: [{ origin: server.origin, path: "/amy-index.txt", methods: ["GET"] },
    { origin: registry, pathPrefix: "/", methods: ["GET"] }] };
  const { run, submit, text } = await open({ policy, setup: redirectFetch(registry, `${server.origin}/npm`) });
  const fails = async command => assert.notEqual(await submit(command), 0, `${command} succeeded:\n${await text()}`);
  await run("amy install janis-install && man janis-install > /dev/null");

  // The latest version satisfies the range; @dolly/shared 2 is at the top and 1.0 beside dolly-left, which needs it.
  await run("janis-install dolly-hello");
  await run(`test "$(dolly-hello)" = 'hello 1.1.0 left shared 1.0.0 shared 2.0.0'`);
  await run(`test -f ${modules}/dolly-left/node_modules/@dolly/shared/index.js && test -f ${modules}/dolly-left/lib/index.js`);
  // An optional package for another platform is not fetched; an optional native addon is fetched and left out;
  // the postinstall script does not run.
  await run(`test ! -e ${modules}/dolly-darwin && test ! -e ${modules}/dolly-addon && test ! -e /tmp/janis-install-postinstall`);
  assert.ok(!tarballs().some(path => path.includes("dolly-darwin")));
  assert.ok(fixture.requests.every(({ path, accept }) => path.endsWith(".tgz") || accept === "application/vnd.npm.install-v1+json"));

  // What is installed is not fetched again; a range picks the highest version in it, and a prerelease only by name.
  const fetched = tarballs().length;
  await run("janis-install dolly-hello");
  assert.equal(tarballs().length, fetched);
  await run(`janis-install dolly-hello@~1.0 && test "$(dolly-hello)" = 'hello 1.0.0'`);
  await run(`janis-install dolly-hello@2.0.0-beta.1 && test "$(dolly-hello)" = 'hello beta'`);

  // Another node_modules directory.
  await run("janis-install --prefix /tmp/other/node_modules dolly-left && test -f /tmp/other/node_modules/@dolly/shared/index.js");
  await run(`cd /tmp/other && test "$(janis -e 'console.log(require("dolly-left"))')" = 'left shared 1.0.0' && cd /workspace`);

  // A copy of the registry's files, as a recipe stages them: nothing is fetched.
  await run(["dolly-left", "@dolly/shared"].map(name => `mkdir -p /tmp/copy/${name}/- && curl -fsS ${registry}/${name} -o /tmp/copy/${name}/metadata.json`)
    .concat(["dolly-left/-/dolly-left-1.0.0.tgz", "@dolly/shared/-/shared-1.0.0.tgz"].map(path => `curl -fsS ${registry}/${path} -o /tmp/copy/${path}`)).join(" && "));
  const copied = fixture.requests.length;
  await run("janis-install --registry /tmp/copy --prefix /tmp/copied/node_modules dolly-left && " +
    `cd /tmp/copied && test "$(janis -e 'console.log(require("dolly-left"))')" = 'left shared 1.0.0' && cd /workspace`);
  assert.equal(fixture.requests.length, copied);

  // A pinned tarball is fetched without metadata, which this registry does not have for it, and checked against the pin.
  await fails(`janis-install --integrity ${integrities["dolly-left@1.0.0"]} dolly-pinned@1.0.0`);
  await run(`test ! -e ${modules}/dolly-pinned && janis-install --integrity ${integrities["dolly-pinned@1.0.0"]} dolly-pinned@1.0.0`);
  await run(`test "$(dolly-pinned with 'two words')" = 'pinned with two words'`);
  assert.ok(!fixture.requests.some(({ path }) => path === "/dolly-pinned"));

  // Refused, with nothing installed: a tarball that does not match its integrity, another platform,
  // a command another package owns, and sources other than the registry, which are not requested.
  await fails("janis-install dolly-tampered");
  await fails("janis-install dolly-mac");
  await fails("janis-install dolly-clash");
  await run(`test ! -e ${modules}/dolly-tampered && test ! -e ${modules}/dolly-mac && test ! -e ${modules}/dolly-clash && janis --version > /dev/null`);
  assert.ok(!tarballs().some(path => path.includes("dolly-mac")));
  const requests = fixture.requests.length;
  for (const spec of ["git+https://example.com/x.git", "user/repo", "./local", "https://example.com/x.tgz", "dolly-alias@npm:dolly-left"]) {
    await fails(`janis-install ${spec}`);
  }
  assert.equal(fixture.requests.length, requests);
});
