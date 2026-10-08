// The image people open: a shell, its text tools, curl and amy, and no
// compiler. Its start-up text is printed once and names only packages the
// site publishes. An image composed from packages holds what it installs and
// reaches only the host modules it declares.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest, composed } from "./browser.mjs";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const recipe = inspectDollyfile(await readFile(new URL("../Dollyfile", import.meta.url), "utf8"));
const welcome = recipe.files.find(({ path }) => path === "/home/dolly/.dollyrc").body;
const published = (await readFile(new URL("../amy-index.txt", import.meta.url), "utf8")).split("\n").map(row => row.split(" ")[0]);

const check = ({ submit, text }) => async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
const hello = "echo '#include <stdio.h>' > /tmp/hello.c && echo 'int main(void) { puts(\"HELLO\"); return 0; }' >> /tmp/hello.c";

await browserTest("default", {}, async ({ open }) => {
  const session = await open();
  const run = check(session);
  // The entry prints the text once; a shell started later prints nothing.
  const installs = [...welcome.matchAll(/amy install (\S+)/g)].map(([, name]) => name);
  assert.ok(installs.length > 0 && installs.every(name => published.includes(name)), `the text names ${installs}`);
  assert.equal((await session.text()).split("amy list").length, 2, "the start-up text is on the first screen once");
  await run("test \"$(slop -c 'echo nested')\" = nested");
  assert.deepEqual(await session.page.evaluate(() => [...__dolly.hostModules].sort()),
    ["display@0", "download@0", "dso@0", "http@0", "input@0", "packages@0", "runtime@0", "snapshot@0", "sockets@0", "threads@0", "upload@0"]);
  await run("mkdir /tmp/made && echo kept > /tmp/made/file && test \"$(grep -c kept /tmp/made/file | sed 's/1/one/')\" = one");
  await run("curl --version > /dev/null && amy list | grep -q '^cc '");
  // The image declares download@0 and upload@0; their commands must be in it.
  await run("download --help | grep -q '^usage: download' && test -x /bin/upload && man download | grep -qi download");
  for (const absent of ["cc --version", "make --version", "git --version"]) assert.equal(await session.submit(absent), 127, absent);
});

// INSTALL cc on the base: C and C++ compile and run. The image declares no
// http@0, so a program linked with the HTTP client is refused before it runs.
await browserTest("composed toolchain", {}, async ({ open }) => {
  const session = await open(await composed(["runtime", "display", "input"], ["core", "display", "cc"]));
  const run = check(session);
  await run(`${hello} && cc /tmp/hello.c -o /tmp/hello && test "$(/tmp/hello)" = HELLO`);
  await run("echo '#include <iostream>' > /tmp/hello.cpp && echo 'int main() { std::cout << 6 * 7; }' >> /tmp/hello.cpp && " +
    "c++ /tmp/hello.cpp -o /tmp/hello++ && test \"$(/tmp/hello++)\" = 42");
  await run("echo '#include <dolly/http.h>' > /tmp/http.c && echo 'int main(void) { dolly_http_response response = {0}; " +
    "dolly_http_request request = {.method = \"GET\", .url = \"https://example.invalid/\", .headers = \"\"}; " +
    "return dolly_http_perform(&request, &response) != 0; }' >> /tmp/http.c && cc /tmp/http.c -o /tmp/http");
  assert.equal(await session.submit("/tmp/http"), 126);
  assert.match(await session.text(), /host module http@0 is not declared by this image/);
});
