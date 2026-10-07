// The sysroot image's libraries in place of the seed's: a program linked with
// them is the same bytes and runs. Usage: node demos/sysroot/test/sysroot-browser.mjs
import { demoTest, installProbe, writeCommand } from "../../browser.mjs";

const serial = `#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
int main(int argc, char **argv) {
  char *text = malloc(64);
  struct tm day = {.tm_year = 126, .tm_mon = 9, .tm_mday = 8};
  snprintf(text, 64, "%.4f %zu %d", sqrt(2.0 * argc), strlen(argv[argc - 1]), (int)(timegm(&day) / 86400));
  puts(text);
  free(text);
  return 0;
}
`;
const threaded = `#include <pthread.h>
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static void *add(void *total) { pthread_mutex_lock(&lock); ++*(int *)total; pthread_mutex_unlock(&lock); return total; }
int main(void) {
  int total = 0;
  pthread_t thread;
  return pthread_create(&thread, 0, add, &total) || pthread_join(thread, 0) || total != 1;
}
`;
// Members of the seed's archives that the image rebuilds. crt1.o and
// libdolly-process.a are linked by path, so every link has the seed's.
const shipped = "'/usr/lib/dolly/process/(threads/)?lib(c-|dlmalloc|standalonewasm|stubs|dolly-[^p])'";
// Output, compile command, and what selects the seed's and the rebuilt
// libraries: -L/usr/lib changes nothing but keeps the argument count.
const links = [
  ["serial", "cc -O1 serial.c -lm", "-L/usr/lib", "-L/usr/lib/sysroot"],
  ["threaded", "cc -O1 -pthread threaded.c", "-L/usr/lib -L/usr/lib", "-L/usr/lib/sysroot/threads -L/usr/lib/sysroot"],
];

for (const browser of ["chromium", "firefox"]) {
  await demoTest("sysroot", { image: "system", browser }, async ({ open }) => {
    const { run } = await open(await installProbe("sysroot"));
    await run("mkdir /tmp/probe && cd /tmp/probe");
    await run(writeCommand("serial.c", serial));
    await run(writeCommand("threaded.c", threaded));
    for (const [output, compile, usual, rebuilt] of links) {
      await run(`${compile} ${usual} -Wl,--trace -o ${output} > shipped.trace && mv ${output} shipped`);
      await run(`${compile} ${rebuilt} -Wl,--trace -o ${output} > rebuilt.trace`);
      // The usual link loads members of the seed's archives; the other loads none of them.
      await run(`grep -q -E ${shipped} shipped.trace && test "$(grep -c -E ${shipped} rebuilt.trace)" = 0`);
      await run(`grep -q '/usr/lib/sysroot/.*libc-' rebuilt.trace && cmp shipped ${output}`);
    }
    await run('test "$(./serial sysroot)" = "2.0000 7 20734"');
  });
}
