/* SPDX-License-Identifier: MIT */
#include "quickjs-runner.h"
int main(int argc, char **argv) {
    return dolly_quickjs_run(argc, argv, "/usr/src/dolly/bhop/agent/main.mjs");
}
