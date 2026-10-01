import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";
import { parseWasmInterface } from "../src/wasm-interface.mjs";
import { executableHostRequirements } from "../host/requirements.mjs";
import { DOLLY_HTTP_ABI_DIGEST } from "../host/http/abi.mjs";

const hostModules = modules => page => page.addInitScript(modules => { globalThis.DOLLY_HOST_MODULES = modules; }, modules);
const sourceOverrides = new Map();
await browserTest("host modules", { image: "system", server: { sourceOverrides } }, async ({ server, open }) => {
  const { page, submit, text } = await open({
    policy: { maxRequests: 200, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: hostModules(["runtime@0", "display@0", "http@0", "download@0", "upload@0", "snapshot@0"]),
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  async function source(code) {
    sourceOverrides.set("/fixture/process-check.c", code);
    await run(`curl -fsS ${server.origin}/fixture/process-check.c -o /tmp/probe.c`);
  }
  // The requirements a linked executable declares, read from the bytes Dolly offers for download.
  async function requirements(path) {
    const pending = page.waitForEvent("download");
    await run(`download ${path}`);
    await page.click("#downloads button");
    const bytes = await readFile(await (await pending).path());
    return [...executableHostRequirements(parseWasmInterface(bytes)).keys()].sort();
  }

  // Only archive members that are actually linked contribute their requirement.
  await source("#include <dolly/host.h>\n#include <dolly/http-abi.h>\nDOLLY_HOST_REQUIRE(http,0,DOLLY_HTTP_ABI_DIGEST);\nint probe(void){return 37;}");
  await run("cc -O1 -c /tmp/probe.c -o /tmp/probe.o && ar rcs /tmp/libprobe.a /tmp/probe.o");
  const linked = {};
  for (const [name, code] of Object.entries({ used: "extern int probe(void);int main(void){return probe()!=37;}",
    unused: "int main(void){return 0;}", header: "#include <dolly/gpu.h>\nint main(void){return 0;}" })) {
    await source(code);
    await run(`cc -O1 /tmp/probe.c /tmp/libprobe.a -o /tmp/${name} && /tmp/${name}`);
    linked[name] = await requirements(`/tmp/${name}`);
  }
  assert.deepEqual(linked.unused, linked.header);
  assert.deepEqual(linked.used, [...linked.unused, "http@0"].sort());
  await source("extern int probe(void);int outer(void){return probe();}");
  await run("cc -O1 -c /tmp/probe.c -o /tmp/outer.o && ar rcs /tmp/libouter.a /tmp/outer.o");
  await source("extern int outer(void);int main(void){return outer()!=37;}");
  await run("cc -O1 /tmp/probe.c /tmp/libouter.a /tmp/libprobe.a -o /tmp/transitive && /tmp/transitive");
  assert.deepEqual(await requirements("/tmp/transitive"), linked.used);

  // A disabled or unknown provider denies the executable before it runs.
  await source("#include <dolly/gpu.h>\nint main(void){static dolly_gpu g;return dolly_gpu_open(&g,0,0)<0;}");
  await run("cc -O1 /tmp/probe.c -ldolly-gpu -o /tmp/gpu-client");
  assert.ok((await requirements("/tmp/gpu-client")).includes("gpu@0"));
  assert.equal(await submit("/tmp/gpu-client"), 126, "a disabled provider must deny the executable");
  // So does a module whose layout differs from its provider's in one digest bit.
  const otherLayout = [...Buffer.from(DOLLY_HTTP_ABI_DIGEST, "hex")].map((byte, index) => index ? byte : byte ^ 1);
  for (const [required, error] of [
    ["unknown,0,DOLLY_HTTP_ABI_DIGEST", /unknown@0 is unsupported/],
    ["http,1,DOLLY_HTTP_ABI_DIGEST", /http@1 is unsupported/],
    ["http,0,OTHER_LAYOUT", /http@0 has a different layout/],
  ]) {
    await source(`#include <dolly/host.h>\n#include <dolly/http-abi.h>\n#include <stdio.h>\n` +
      `#define OTHER_LAYOUT ${otherLayout.join(",")}\nDOLLY_HOST_REQUIRE(${required});\n` +
      `int main(void){FILE*f=fopen("/tmp/entered","w");if(f)fclose(f);return 0;}`);
    await run("cc -O1 /tmp/probe.c -o /tmp/denied");
    assert.equal(await submit("/tmp/denied"), 126);
    assert.match(await text(), error);
    await run("test ! -e /tmp/entered");
  }
  // Without a requirement claim the disabled outer provider still denies the operation.
  await source("#include <dolly/process.h>\n#include <dolly/gpu-abi.h>\n#include <stdint.h>\n#include <errno.h>\nint main(void){uint64_t p[5]={DOLLY_GPU_OPEN*(1ull<<32),0,1,8,0};char reply[64];return dolly_process_call(DOLLY_GPU_PROCESS_OP,p,sizeof p,reply,sizeof reply)!=-ENOSYS;}");
  await run("cc -O1 /tmp/probe.c -o /tmp/forged && /tmp/forged");
  assert.ok(!(await requirements("/tmp/forged")).includes("gpu@0"));
  await source('#include <dolly/host.h>\n#include <dolly/gpu-abi.h>\n#include <stdio.h>\nDOLLY_HOST_REQUIRE(gpu,1,DOLLY_GPU_ABI_DIGEST);\n__attribute__((constructor)) static void init(void){FILE*f=fopen("/tmp/dso-entered","w");if(f)fclose(f);}\nint probe(void){return 37;}');
  await run("cc -shared -O1 /tmp/probe.c -o /tmp/denied.so");
  assert.deepEqual(await requirements("/tmp/denied.so"), ["gpu@1"]);
  await source('#include <dlfcn.h>\n#include <string.h>\nint main(void){void*h=dlopen("/tmp/denied.so",RTLD_NOW);const char*e=dlerror();return h!=0||!e||!strstr(e,"gpu@1");}');
  await run("cc -rdynamic -O1 /tmp/probe.c -o /tmp/dso-host && /tmp/dso-host && test ! -e /tmp/dso-entered");
  assert.notEqual(await submit(`curl -fsS ${server.origin}/denied`), 0);
  assert.equal(server.requests.has("/denied"), false, "denied network request escaped the broker");
  assert.deepEqual(errors, []);

  // An image whose required provider is disabled fails before its large downloads.
  const requests = [];
  await open({ prompt: null, setup: async denied => {
    await hostModules(["runtime@0", "display@0", "download@0", "upload@0", "snapshot@0"])(denied);
    denied.on("request", request => requests.push(new URL(request.url()).pathname));
  } }).then(() => assert.fail("booted without a required provider"), error => assert.match(error.message, /http@0/));
  assert.equal(requests.some(path => /\.snapshot(?:\.gz)?$|\/dolly\.wasm$/.test(path)), false,
    "compatibility must fail before large downloads");
});
