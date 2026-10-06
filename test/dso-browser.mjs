// Loadable modules and FFI in an image that declares dso@0: `system` with the
// module (and threads@0) added, since a test states what its programs need.
// What a program sees in an image without it is in host-modules-browser.mjs.
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";
import { runCppDsoCase } from "./fixtures/cpp-sdk.mjs";

const fixtures = Object.fromEntries(["dso-check.c", "dso-library.c", "dso-cpp-check.cpp", "dso-cpp-library.cpp"]
  .map(name => [name, `src/process/${name}`]));
fixtures["process-signals.c"] = "test/fixtures/process-signals.c";
const sources = {
  // A library that records a module this image does not declare.
  "denied.c": `#include <dolly/host.h>
#include <dolly/gpu-abi.h>
#include <stdio.h>
DOLLY_HOST_REQUIRE(gpu, 1, DOLLY_GPU_ABI_DIGEST);
__attribute__((constructor)) static void enter(void) { FILE *file = fopen("/tmp/dso/entered", "w"); if (file) fclose(file); }
int probe(void) { return 37; }
`,
  "host.c": `#include <dlfcn.h>
#include <errno.h>
#include <string.h>
#include <dolly/dso.h>
#include <dolly/process.h>
int main(void) {
  void *library = dlopen("/tmp/dso/denied.so", RTLD_NOW);
  const char *error = dlerror();
  if (library != NULL || error == NULL || strstr(error, "gpu@1") == NULL) return 1;
  // An unknown handle is an error in the response; a response that cannot hold one an errno.
  dolly_dso_close_request request = {123456};
  dolly_dso_response response;
  if (dolly_process_call(DOLLY_DSO_CLOSE, &request, sizeof(request), &response, sizeof(response)) != sizeof(response) ||
      response.error != EBADF) return 2;
  return dolly_process_call(DOLLY_DSO_CLOSE, &request, sizeof(request), &response, 1) != -ENOBUFS;
}
`,
  "ffi.c": `#include <errno.h>
#include <stdint.h>
#include <dolly/dso.h>
#include <dolly/process.h>
static int sum(int left, int right) { return left + right; }
int main(void) {
  // FFI packets carry pointers of the process: a wrong size or a wild one is an errno.
  if (dolly_process_call(DOLLY_FFI_CALL, NULL, 0, NULL, 0) != -EINVAL) return 1;
  dolly_ffi_call_request wild = {0};
  if (dolly_ffi_call(&wild) != -EFAULT) return 2;
  wild.cif = UINT64_MAX;
  if (dolly_ffi_call(&wild) != -EFAULT) return 3;
  const dolly_ffi_closure_prep_request closure = {8, UINT64_MAX};
  if (dolly_ffi_closure_prep(&closure) != -EINVAL) return 4;
  // A well-formed call (libffi's wasm64 cif of two ints) reaches its target.
  struct { uint64_t size; uint16_t alignment, type; uint64_t elements; } ffi_int = {4, 4, 1, 0};
  uint64_t argument_types[2] = {(uint64_t)&ffi_int, (uint64_t)&ffi_int};
  struct { uint32_t abi, nargs; uint64_t argument_types, return_type; uint32_t bytes, flags, fixed; } cif =
      {2, 2, (uint64_t)argument_types, (uint64_t)&ffi_int, 0, 0, 2};
  int left = 30, right = 12;
  uint64_t values[2] = {(uint64_t)&left, (uint64_t)&right}, result = 0;
  const dolly_ffi_call_request call = {(uint64_t)&cif, (uint64_t)(uintptr_t)sum, (uint64_t)&result, (uint64_t)values};
  return dolly_ffi_call(&call) != 0 || (int)result != 42;
}
`,
  // No host and no FFI client: the library a host loads above stays closed to it.
  "caller.c": `#include <dlfcn.h>
#include <errno.h>
#include <dolly/dso-abi.h>
#include <dolly/process.h>
int main(void) {
  char packet[16] = {0}, reply[256];
  errno = 0;
  if (dlopen("/tmp/dso/dso-library.so", RTLD_NOW) != NULL || errno != ENOSYS || dlerror() == NULL) return 1;
  return dolly_process_call(DOLLY_DSO_OPEN, packet, sizeof(packet), reply, sizeof(reply)) != -ENOSYS;
}
`,
  "threaded.c": "int main(void) { return 0; }\n",
};
function handle(request, response, path, headers) {
  const body = path.startsWith("/fixture/") ? sources[path.slice("/fixture/".length)] : undefined;
  if (body === undefined) return false;
  response.writeHead(200, { ...headers, "content-type": "text/plain" }).end(body);
  return true;
}

await browserTest("dso", { image: "system", timeout: 300_000, server: { fixtures, handle } }, async ({ server, open }) => {
  const loaderFetches = () => server.requests.get("/dist/dolly-process-dso.mjs") ?? 0;
  const before = loaderFetches();
  const { submit, text } = await open({ policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    ...await composed(["runtime", "display", "download", "http", "snapshot", "upload", "dso", "threads"], [], "system") });
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  // The loader arrives with the page, as the process Worker does, never with a program.
  const fetched = loaderFetches();
  assert.ok(fetched > before, "the image declares dso@0 and its loader was not fetched");
  await run("mkdir /tmp/dso && cd /tmp/dso");
  for (const name of [...Object.keys(fixtures), ...Object.keys(sources)]) await run(`curl -fsS ${server.origin}/fixture/${name} -o ${name}`);

  // A C and a C++ host load a library and call into it; both share one libc.
  await run("cc -O0 -shared dso-library.c -o dso-library.so && cc -O0 -rdynamic dso-check.c -o dso-check && ./dso-check /tmp/dso/dso-library.so");
  await run("c++ -O0 -shared dso-cpp-library.cpp -o dso-cpp-library.so && c++ -O0 -rdynamic dso-cpp-check.cpp -o dso-cpp-check && ./dso-cpp-check /tmp/dso/dso-cpp-library.so");
  assert.equal(await submit("./dso-check /tmp/dso/dso-library.so 37"), 37,
    "a DSO exits only its owning process through the shared libc provider");
  await runCppDsoCase(submit);
  // A library's own records are checked before it is entered, and packets are bounded.
  await run("cc -O1 -shared denied.c -o denied.so && cc -O1 -rdynamic host.c -o host && ./host && test ! -e /tmp/dso/entered");
  // FFI needs no host: a program that links its client is served.
  await run("cc -O1 ffi.c -o ffi && ./ffi");
  // A host keeps one owner of signal state although -rdynamic roots all of libc.
  await run("cc -O0 -rdynamic process-signals.c -o signals && timeout 30 /tmp/dso/signals /tmp/dso");
  // A program that records nothing is served nothing, in this image too.
  await run("cc -O1 caller.c -o caller && ./caller");
  // The loader holds one Worker's function table: no program has it and threads.
  await run("cc -O1 -pthread -Wl,--export=__dolly_dso_allocate threaded.c -o threaded");
  assert.equal(await submit("./threaded 2> refused"), 126);
  await run("test $(wc -l < refused) -eq 1 && grep -q 'dso@0' refused");
  assert.equal(loaderFetches(), fetched, "a program fetched the loader");
});
