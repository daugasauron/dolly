#include "quickjs-runner.h"

int main(int argc, char **argv) {
  return dolly_quickjs_run(argc, argv, "/usr/lib/vendor-crates/vendor-crates.mjs");
}
