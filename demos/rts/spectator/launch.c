// SPDX-License-Identifier: GPL-2.0-or-later
#include "quickjs-runner.h"

int main(int argc, char **argv) {
    return dolly_quickjs_run(argc, argv, "/usr/src/dolly/rts/spectator/main.mjs");
}
