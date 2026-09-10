/* Dolly reports Wasm traps; native signal backtraces do not apply. */
/* SPDX-License-Identifier: MIT */
#undef CC_BUILD_POSIX
#include "Logger.c"

void CrashHandler_DumpRegisters(void* ctx, cc_string* str) {
    String_AppendConst(str, "Wasm registers are not exposed by Dolly.");
}
