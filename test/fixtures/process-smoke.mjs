import assert from "node:assert/strict";

export const processSmokeSources = Object.freeze({
  "process-check.c": "src/process/check.c",
  "fs-check.c": "src/process/fs-check.c",
  "io-stress.c": "test/fixtures/process-io-stress.c",
  "env-driver.c": "src/process/env-driver.c",
  "cpp-check.cpp": "src/process/cpp-check.cpp",
  "http-check.c": "src/process/http-check.c",
  "pipe-check.c": "src/process/pipe-check.c",
  "pipe-driver.c": "src/process/pipe-driver.c",
  "poll-check.c": "src/process/poll-check.c",
  "mmap-check.c": "src/process/mmap-check.c",
  "terminal-check.c": "src/process/terminal-check.c",
  "self-exe-check.c": "src/process/self-exe-check.c",
  "dso-check.c": "src/process/dso-check.c",
  "dso-library.c": "src/process/dso-library.c",
  "dso-cpp-check.cpp": "src/process/dso-cpp-check.cpp",
  "dso-cpp-library.cpp": "src/process/dso-cpp-library.cpp",
});

export async function runProcessSmoke(submit, origin) {
  const scratch = "/tmp/dolly-process-smoke";
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir ${scratch}`);
  try {
    for (const name of Object.keys(processSmokeSources)) {
      await run(`curl -fsS ${origin}/fixture/${name} -o ${scratch}/${name}`);
      const cxx = name.endsWith(".cpp");
      const library = name.includes("library");
      const output = name.replace(/\.c(?:pp)?$/, library ? ".so" : "");
      await run(`cd ${scratch}; ${cxx ? "c++" : "cc"} -O0 ${library ? "-shared" : "-rdynamic"} ${name} -o ${output}`);
    }
    await run(`printf '%s\\n' '-O0 cpp-check.cpp -o "response program"' > compile.rsp`);
    await run("printf '%s\\n' '@compile.rsp' > nested.rsp");
    await run("c++ @nested.rsp && './response program'");
    await run("printf '%s\\n' '@cycle.rsp' > cycle.rsp");
    assert.equal(await submit("cc @cycle.rsp"), 64, "recursive compiler response file");
    assert.notEqual(await submit("cc @missing.rsp"), 0, "missing compiler response file");
    await run("printf '#warning diagnostic-probe\\nint main(void) { return 0; }\\n' > warning.c");
    assert.notEqual(await submit("cc -Werror warning.c -o warning"), 0, "warnings as errors");
    await run("cc -Werror -w warning.c -o warning && ./warning");
    await run("printf 'int main(void) { return ((char)-1 < 0) != EXPECT_SIGNED; }\\n' > char.c");
    await run("cc -O0 -funsigned-char -DEXPECT_SIGNED=0 char.c -o char && ./char");
    await run("cc -O0 -funsigned-char -fsigned-char -DEXPECT_SIGNED=1 char.c -o char && ./char");
    await run("cc -O0 -fno-unsigned-char -fno-signed-char -DEXPECT_SIGNED=0 char.c -o char && ./char");
    await run("printf '#include <pty.h>\\n#include <errno.h>\\nint main(void) { int master, slave; return openpty(&master, &slave, 0, 0, 0) != -1 || errno != ENOENT; }\\n' > pty.c");
    await run("cc -O0 pty.c -lutil -o pty && ./pty");
    await run("printf 'static volatile unsigned char data[20 * 1024 * 1024] = {1};\\nint main(void) { data[sizeof(data)-1]=42; return data[0]!=1 || data[sizeof(data)-1]!=42; }\\n' > memory.c");
    assert.notEqual(await submit("cc memory.c -o memory"), 0, "static data exceeds the default initial memory");
    await run("cc memory.c -Wl,--initial-memory=33554432,--max-memory=67108864 -o memory && ./memory");
    assert.notEqual(await submit("cc memory.c -Wl,--initial-memory=33554432,--max-memory=17179869184 -o memory"), 0,
      "compiler rejects memory above the process ceiling");
    await run("cp self-exe-check identity-one && cp self-exe-check identity-two && ln -s self-exe-check identity-alias");
    await run(`printf '#!${scratch}/self-exe-check ${scratch}/self-exe-check\\n' > identity-script`);
    await run("./self-exe-check && ./identity-script");
    for (const command of [
      "DOLLY_PROCESS_CHECK=private-memory ./process-check fresh",
      "DOLLY_PROCESS_CHECK=private-memory ./process-check fresh",
      `./fs-check write ${scratch}/data`, `./fs-check read ${scratch}/data`,
      "./io-stress",
      `./env-driver ${scratch}/process-check`, "./cpp-check",
      `DOLLY_PROCESS_HTTP_CHECK_URL=${origin}/fixture/http.txt ./http-check`,
      `/bin/slop -c './fs-check write ${scratch}/data && ./fs-check read ${scratch}/data'`,
      "/bin/slop -c 'export DOLLY_PROCESS_CHECK=private-memory; case \"$DOLLY_PROCESS_CHECK\" in private-memory) : ;; *) exit 94 ;; esac; ./process-check fresh'",
      `./pipe-driver ${scratch}/pipe-check`, "./poll-check", "./mmap-check", "./mmap-check", "./terminal-check", "cc --version",
      `./dso-check ${scratch}/dso-library.so`, `./dso-cpp-check ${scratch}/dso-cpp-library.so`,
    ]) await run(command);
    await run(`./fs-check write ${scratch}/data`);
    assert.equal(await submit(`./dso-check ${scratch}/dso-library.so 37`), 37,
      "a DSO exits only its owning process through the shared libc provider");
    await run(`./fs-check read ${scratch}/data`);
  } finally {
    await submit(`cd /workspace; rm -rf ${scratch}`);
  }
}
