import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest, composed } from "./browser.mjs";
import { parseWasmInterface } from "../src/wasm-interface.mjs";
import { executableHostRequirements } from "../host/requirements.mjs";
import { DOLLY_HTTP_ABI_DIGEST } from "../host/http/abi.mjs";

const hostModules = modules => page => page.addInitScript(modules => { globalThis.DOLLY_HOST_MODULES = modules; }, modules);
const sourceOverrides = new Map();
// A probe in an image without input cannot be typed to: it reports by request path.
let reported;
function handle(request, response, path, headers) {
  if (!path.startsWith("/fixture/report/")) return false;
  reported(path.slice("/fixture/report/".length));
  response.writeHead(200, headers).end();
  return true;
}
await browserTest("host modules", { image: "system", server: { sourceOverrides, handle }, timeout: 300_000 }, async ({ server, open }) => {
  const { page, submit, text } = await open({
    policy: { maxRequests: 200, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: hostModules(["runtime@0", "display@0", "input@0", "http@0", "download@0", "upload@0", "snapshot@0"]),
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  // A refused program exits 126 with one line on its own stderr that names the cause.
  async function refused(command, cause) {
    assert.equal(await submit(`${command} > /tmp/refused.out 2> /tmp/refused.err`), 126, command);
    await run(`test ! -s /tmp/refused.out && test $(wc -l < /tmp/refused.err) -eq 1 && grep -q '${cause}' /tmp/refused.err`);
  }
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
  await refused("/tmp/gpu-client", "gpu@0");
  // So does a module whose layout differs from its provider's in one digest bit.
  const otherLayout = [...Buffer.from(DOLLY_HTTP_ABI_DIGEST, "hex")].map((byte, index) => index ? byte : byte ^ 1);
  for (const [required, cause] of [
    ["unknown,0,DOLLY_HTTP_ABI_DIGEST", "unknown@0"],
    ["http,1,DOLLY_HTTP_ABI_DIGEST", "http@1"],
    ["http,0,OTHER_LAYOUT", "http@0"],
  ]) {
    await source(`#include <dolly/host.h>\n#include <dolly/http-abi.h>\n#include <stdio.h>\n` +
      `#define OTHER_LAYOUT ${otherLayout.join(",")}\nDOLLY_HOST_REQUIRE(${required});\n` +
      `int main(void){FILE*f=fopen("/tmp/entered","w");if(f)fclose(f);return 0;}`);
    await run("cc -O1 /tmp/probe.c -o /tmp/denied");
    await refused("/tmp/denied", cause);
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
    await hostModules(["runtime@0", "display@0", "input@0", "download@0", "upload@0", "snapshot@0"])(denied);
    denied.on("request", request => requests.push(new URL(request.url()).pathname));
  } }).then(() => assert.fail("booted without a required provider"), error => assert.match(error.message, /http@0/));
  assert.equal(requests.some(path => /\.snapshot(?:\.gz)?$|\/dolly\.wasm$/.test(path)), false,
    "compatibility must fail before large downloads");

  // A runtime is declared like any module: a recipe without one is refused
  // naming the line to add, one naming a runtime this page lacks by its name.
  for (const [hosts, cause] of [[["display"], /add REQUIRES HOST runtime@0/], [["display", "other"], /other@0/]]) {
    await open({ prompt: null, ...await composed(hosts, []) })
      .then(() => assert.fail("built without a runtime"), error => assert.match(error.message, cause));
  }

  // An image that draws and declares no input@0: the page has no input
  // provider, a program linking the input client is refused with one line
  // before it runs, the operation itself is ENOSYS to a program that links no
  // client, and the terminal reads no key however many are pressed.
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/report/", methods: ["GET"] }] };
  const report = new Promise(resolve => { reported = resolve; });
  const drawing = await open({ prompt: null, policy, ...await composed(["runtime", "display", "http"], ["core", "display", "cc", "curl"], {
    entry: "/bin/slop /usr/share/probe/entry",
    files: {
      "/usr/share/probe/leases.c": "#include <dolly/input.h>\nint main(void) { uint64_t lease; return dolly_input_acquire(&lease) != 0; }",
      "/usr/share/probe/forged.c": "#include <dolly/process.h>\n#include <dolly/input-abi.h>\n#include <errno.h>\n" +
        "int main(void) { char lease[8]; return dolly_process_call(DOLLY_INPUT_ACQUIRE, 0, 0, lease, sizeof lease) != -ENOSYS; }",
      "/usr/share/probe/reads.c": "#include <dolly/runtime.h>\n" +
        "int main(void) { return dolly_terminal_mode_set(0, 0) != 0 || dolly_terminal_read_raw_timeout(3000) >= 0; }",
      "/usr/share/probe/entry": `
cc /usr/share/probe/leases.c -o /tmp/leases && cc /usr/share/probe/forged.c -o /tmp/forged && cc /usr/share/probe/reads.c -o /tmp/reads || exit
/tmp/leases > /tmp/out 2> /tmp/err
test $? -eq 126 && test ! -s /tmp/out && test $(wc -l < /tmp/err) -eq 1 && grep -q 'host module input@0 is not declared by this image (REQUIRES HOST)' /tmp/err
refused=$?
/tmp/forged
forged=$?
/tmp/reads
curl -fsS ${server.origin}/fixture/report/refused-$refused/forged-$forged/read-$?
sleep 60`,
    },
  }) });
  assert.deepEqual(await drawing.page.evaluate(() => [[...__dolly.hostModules].sort(), "inputTransport" in __dolly, "transport" in __dolly]),
    [["display@0", "http@0", "runtime@0"], false, true]);
  const typing = setInterval(() => void drawing.page.keyboard.press("k").catch(() => {}), 100);
  try { assert.equal(await report, "refused-0/forged-0/read-0"); } finally { clearInterval(typing); }
  await drawing.page.close();

  // An image with input@0 and no display: a program that takes the input
  // lease reads the keys; its output is the page's plain log.
  const headless = await open({ prompt: null, ...await composed(["runtime", "input"], ["core", "cc"], {
    entry: "/bin/slop /usr/share/probe/entry",
    files: {
      "/usr/share/probe/keys.c": `
#include <dolly/input.h>
#include <stdio.h>
int main(void) {
  uint64_t lease;
  dolly_input_event event;
  if (dolly_input_acquire(&lease) != 0) return 1;
  puts("INPUT-LEASED");
  fflush(stdout);
  do {
    if (dolly_input_next_event(lease, &event, 20000) != 1) return 2;
  } while (event.type != DOLLY_INPUT_EVENT_KEY || event.action != DOLLY_KEY_ACTION_PRESS);
  printf("INPUT-KEY %.*s %.*s\\n", event.key_length, event.data, event.code_length, event.data + event.key_length);
  return dolly_input_release(lease) != 0;
}`,
      "/usr/share/probe/entry": "cc /usr/share/probe/keys.c -o /tmp/keys && /tmp/keys\necho INPUT-STATUS $?",
    },
  }) });
  const logged = text => headless.page.waitForFunction(text => document.querySelector("#bootstrap-log").textContent.includes(text), text);
  assert.deepEqual(await headless.page.evaluate(() => [[...__dolly.hostModules].sort(), "transport" in __dolly,
    document.querySelector("#display").hidden]), [["input@0", "runtime@0"], false, true]);
  await logged("INPUT-LEASED");
  await headless.page.keyboard.press("k");
  await logged("INPUT-KEY k KeyK");
  await logged("INPUT-STATUS 0");
});
