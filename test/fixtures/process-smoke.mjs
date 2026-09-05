import assert from "node:assert/strict";

export const processSmokeSources = Object.freeze({
  "process-check.c": "src/process/check.c",
  "fs-check.c": "src/process/fs-check.c",
  "env-driver.c": "src/process/env-driver.c",
  "cpp-check.cpp": "src/process/cpp-check.cpp",
  "http-check.c": "src/process/http-check.c",
  "pipe-check.c": "src/process/pipe-check.c",
  "pipe-driver.c": "src/process/pipe-driver.c",
  "poll-check.c": "src/process/poll-check.c",
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
    for (const command of [
      "DOLLY_PROCESS_CHECK=private-memory ./process-check fresh",
      "DOLLY_PROCESS_CHECK=private-memory ./process-check fresh",
      `./fs-check write ${scratch}/data`, `./fs-check read ${scratch}/data`,
      `./env-driver ${scratch}/process-check`, "./cpp-check",
      `DOLLY_PROCESS_HTTP_CHECK_URL=${origin}/Dollyfile ./http-check`,
      `/bin/slop -c './fs-check write ${scratch}/data && ./fs-check read ${scratch}/data'`,
      "/bin/slop -c 'export DOLLY_PROCESS_CHECK=private-memory; case \"$DOLLY_PROCESS_CHECK\" in private-memory) : ;; *) exit 94 ;; esac; ./process-check fresh'",
      `./pipe-driver ${scratch}/pipe-check`, "./poll-check", "cc --version",
      `./dso-check ${scratch}/dso-library.so`, `./dso-cpp-check ${scratch}/dso-cpp-library.so`,
    ]) await run(command);
  } finally {
    await submit(`cd /workspace; rm -rf ${scratch}`);
  }
}
