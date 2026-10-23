#include "quickjs-runner.h"

int main(int argc, char **argv) {
  return dolly_quickjs_run(argc, argv, "/usr/lib/janis-install/janis-install.mjs");
}
