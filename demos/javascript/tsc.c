#include "quickjs-runner.h"

int main(int argc, char **argv) {
  return dolly_quickjs_run(argc, argv, "/usr/lib/typescript/tsc-dolly.mjs");
}
