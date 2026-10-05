// The compiler-free base. `minimal` opens with Slop and its core commands and
// nothing else; an image composed from packages holds what it installs and
// reaches only the host modules it declares.
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

const check = ({ submit, text }) => async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
const hello = "echo '#include <stdio.h>' > /tmp/hello.c && echo 'int main(void) { puts(\"HELLO\"); return 0; }' >> /tmp/hello.c";

await browserTest("minimal", { image: "minimal" }, async ({ open }) => {
  const session = await open();
  await check(session)("mkdir /tmp/made && echo kept > /tmp/made/file && test \"$(cat /tmp/made/file)\" = kept");
  for (const absent of ["cc --version", "dollyfile --help", "curl --version", "amy list"]) {
    assert.equal(await session.submit(absent), 127, absent);
  }
});

// INSTALL cc on the base: C and C++ compile and run. The image declares no
// http@0, so a program linked with the HTTP client is refused before it runs.
await browserTest("composed toolchain", { image: "minimal" }, async ({ open }) => {
  const session = await open(await composed(["display"], ["core", "display", "cc"]));
  const run = check(session);
  await run(`${hello} && cc /tmp/hello.c -o /tmp/hello && test "$(/tmp/hello)" = HELLO`);
  await run("echo '#include <iostream>' > /tmp/hello.cpp && echo 'int main() { std::cout << 6 * 7; }' >> /tmp/hello.cpp && " +
    "c++ /tmp/hello.cpp -o /tmp/hello++ && test \"$(/tmp/hello++)\" = 42");
  await run("echo '#include <dolly/http.h>' > /tmp/http.c && echo 'int main(void) { dolly_http_response response = {0}; " +
    "dolly_http_request request = {.method = \"GET\", .url = \"https://example.invalid/\", .headers = \"\"}; " +
    "return dolly_http_perform(&request, &response) != 0; }' >> /tmp/http.c && cc /tmp/http.c -o /tmp/http");
  assert.equal(await session.submit("/tmp/http"), 126);
  assert.match(await session.text(), /http@0 is unsupported/);
});
