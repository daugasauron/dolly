import assert from "node:assert/strict";
import { shellQuote } from "./slop-cases.mjs";

const source = `const std = @import("std");
export fn sdk_math(x: f64) callconv(.c) f64 {
    return std.math.sqrt(x) + @sin(x);
}
export fn sdk_div(n: u64, d: u64) callconv(.c) u64 {
    return @truncate((@as(u128, n) << 64) / @as(u128, d));
}
export fn sdk_sum() callconv(.c) u64 {
    var list: std.ArrayList(u64) = .empty;
    defer list.deinit(std.heap.c_allocator);
    list.appendSlice(std.heap.c_allocator, &.{ 10, 20, 12 }) catch return 0;
    var result: u64 = 0;
    for (list.items) |value| result += value;
    return result;
}
test "allocated container" {
    try std.testing.expectEqual(@as(u64, 42), sdk_sum());
}
`;
const driver = `#include <math.h>
#include <stdint.h>
extern double sdk_math(double);
extern uint64_t sdk_div(uint64_t, uint64_t), sdk_sum(void);
int main(void) {
    return sdk_sum() != 42 || fabs(sdk_math(4.0) - (2.0 + sin(4.0))) > 1e-12 ||
           sdk_div(123, 7) != (uint64_t)(((__uint128_t)123 << 64) / 7);
}
`;

export async function runZigSdkCases(submit) {
  const scratch = "/tmp/dolly-zig-sdk-test";
  const clang = "/usr/libexec/dolly/process-bin/compiler";
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p ${scratch}`);
  try {
    await run("zig version");
    for (const [name, text] of [["main.zig", source], ["main.c", driver]]) {
      const lines = text.trimEnd().split("\n").map(line => `echo -- ${shellQuote(line)}`);
      await run(`{ ${lines.join("; ")}; } > ${scratch}/${name}`);
    }
    const flags = `-OReleaseSmall -target wasm64-emscripten -mcpu=generic+atomics ` +
      `-fPIC -fsingle-threaded -fcompiler-rt -lc --cache-dir ${scratch}/cache ` +
      `--global-cache-dir ${scratch}/global-cache`;
    await run(`mv ${clang} ${scratch}/clang`);
    try {
      await run(`zig build-obj ${flags} -femit-bin=${scratch}/main.o -Mroot=${scratch}/main.zig`);
      await run(`zig test-obj --test-no-exec ${flags} -femit-bin=${scratch}/test.o -Mroot=${scratch}/main.zig`);
      await run(`test -s ${scratch}/test.o`);
    } finally {
      await run(`mv ${scratch}/clang ${clang}`);
    }
    await run(`cc ${scratch}/main.c ${scratch}/main.o -lm -o ${scratch}/main`);
    await run(`${scratch}/main`);
  } finally {
    await submit(`rm -rf ${scratch}`);
  }
}
