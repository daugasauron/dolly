// CMake and a source-built libuv in the cmake-build image, opened with the
// terminal display. Usage: node demos/cmake/test/cmake-browser.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { demoTest, displayProbe, writeCommand } from "../../browser.mjs";

const projectDir = new URL("../../..", import.meta.url).pathname;
const libuv = execFileSync("bash", ["demos/cmake/prepare-libuv.sh"], { cwd: projectDir, encoding: "utf8" }).trim();
execFileSync("node", ["scripts/build-source-tar.mjs", "build/fixtures/libuv-source.tar",
  `${libuv}/include`, "/tmp/dolly-libuv/source/include", `${libuv}/src`, "/tmp/dolly-libuv/source/src",
  `${libuv}/LICENSE`, "/tmp/dolly-libuv/LICENSE", "demos/cmake/libuv", "/tmp/dolly-libuv/dolly",
  "demos/cmake/libuv-dolly.mk", "/tmp/dolly-libuv/Makefile", "demos/cmake/test/fixtures/libuv.c", "/tmp/dolly-libuv/probe.c",
  "demos/cmake/test/fixtures/libuv-dso.c", "/tmp/dolly-libuv/dso.c"], { cwd: projectDir });

const project = {
  "CMakeLists.txt": `cmake_minimum_required(VERSION 3.20)
project(dolly_probe C CXX)
add_library(answer STATIC answer.c)
add_executable(probe main.cpp)
target_link_libraries(probe PRIVATE answer)
install(TARGETS probe RUNTIME DESTINATION bin)
`,
  "answer.c": "int answer(void) { return 42; }\n",
  "main.cpp": '#include <iostream>\nextern "C" int answer(void);\nint main() { std::cout << "CMAKE-OK\\n"; return answer() != 42; }\n',
};

await demoTest("cmake", { image: "cmake-build", timeout: 600_000,
  server: { fixtures: { "libuv-source.tar": "build/fixtures/libuv-source.tar" } } }, async ({ server, open }) => {
  const { page, run, start, waitText } = await open({ ...await displayProbe("cmake-build"),
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const scratch = "/tmp/dolly-cmake-test";
  await run(`mkdir ${scratch}`);
  for (const [name, source] of Object.entries(project)) await run(writeCommand(`${scratch}/${name}`, source));
  await run(`cmake -S ${scratch} -B ${scratch}/build -DCMAKE_C_FLAGS=-O0 -DCMAKE_CXX_FLAGS=-O0 -DCMAKE_INSTALL_PREFIX=${scratch}/install`);
  await run(`cmake --build ${scratch}/build --parallel 1 && cmake --install ${scratch}/build`);
  await run(`test "$(${scratch}/install/bin/probe)" = CMAKE-OK && cmake --build ${scratch}/build --parallel 1`);
  await run(`rm -rf ${scratch}`);

  // libuv's work, cancellation, files, children, TTY input, SIGWINCH and SIGINT.
  for (const command of [
    `curl -fsS ${server.origin}/fixture/libuv-source.tar | tar -xf - -C /`,
    "cd /tmp/dolly-libuv && make",
    "cc -O0 -Isource/include probe.c libuv.a -o probe",
    "timeout 30 ./probe",
    "cc -shared -rdynamic objects/*.o -o libuv.so",
    "cc -O0 -rdynamic -Isource/include dso.c -o dso",
    "timeout 30 ./dso",
  ]) await run(command);
  for (const cancel of [false, true]) {
    await run("clear");
    const probe = start("timeout 15 ./probe tty");
    await waitText(/LIBUV-TTY-READY/);
    await page.setViewportSize(cancel ? { width: 1000, height: 750 } : { width: 900, height: 650 });
    await waitText(/LIBUV-RESIZED/);
    if (cancel) await page.keyboard.press("Control+c");
    else await page.keyboard.type("hello");
    assert.equal(await probe.done, cancel ? 130 : 0);
  }
  // SIGINT must reach the libuv callback, not only terminate its Worker.
  await run("test -f interrupt-handled && cd / && rm -rf /tmp/dolly-libuv");
});
