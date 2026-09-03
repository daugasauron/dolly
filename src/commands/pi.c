#include "quickjs-runner.h"

int main(int argc, char **argv) {
  return dolly_quickjs_run(
      argc, argv,
      "/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
}
