// A program linked with cc's --dolly-cast-emulation (binaryen's wasm-opt) loads
// a library linked so, and each calls the other's functions through pointers
// of other types; a library linked without it is refused (dso@0,
// docs/process-model.md). Usage: node demos/tools/test/cast-emulation-browser.mjs
import { browsers } from "../../browsers.mjs";
import { demoTest, writeCommand } from "../../browser.mjs";
import { composed } from "../../../test/browser.mjs";

const library = `static int add(int left, int right) { return left + right; }
int add2(int left, int right) { return left + right; }
int (*take(void))(int, int) { return add; }
int apply(int (*function)(int), int value) { return function(value); }
extern int host_twice(int);
int (*host_function(void))(int) { return host_twice; }
`;
const host = `#include <dlfcn.h>
#include <string.h>
int host_twice(int value) { return 2 * value; }
static int no_arguments(void) { return 42; }
int main(int argc, char **argv) {
  void *library = dlopen(argv[1], RTLD_NOW);
  if (!library) return 1;
  long (*wide)(long, long, long) = (long (*)(long, long, long))dlsym(library, "add2");
  int (*(*take)(void))(int, int) = (int (*(*)(void))(int, int))dlsym(library, "take");
  int (*apply)(int (*)(int), int) = (int (*)(int (*)(int), int))dlsym(library, "apply");
  int (*(*host_function)(void))(int) = (int (*(*)(void))(int))dlsym(library, "host_function");
  if (!wide || !take || !apply || !host_function) return 2;
  if (wide(40, 2, 99) != 42 || take()(40, 2) != 42) return 3;
  if (apply((int (*)(int))no_arguments, 7) != 42 || host_function()(21) != 42) return 4;
  // A pointer to a function is one, wherever it is taken.
  if (host_function() != host_twice || dlsym(RTLD_DEFAULT, "host_twice") != (void *)host_twice) return 6;
  // A library linked without the emulation has table entries of other types.
  return dlopen(argv[2], RTLD_NOW) != NULL || strstr(dlerror(), "--dolly-cast-emulation") == NULL ? 5 : 0;
}
`;
for (const browser of browsers) {
  await demoTest("cast-emulation", { image: "system", browser }, async ({ open }) => {
    const { run } = await open(await composed(["dso"], ["binaryen"], { base: "system" }));
    await run("mkdir /tmp/cast && cd /tmp/cast");
    await run(writeCommand("library.c", library));
    await run(writeCommand("host.c", host));
    await run("cc -O1 -shared --dolly-cast-emulation library.c -o library.so && cc -O1 -shared library.c -o plain.so");
    await run("cc -O1 -rdynamic --dolly-cast-emulation host.c -o host && ./host /tmp/cast/library.so /tmp/cast/plain.so");
  });
}
