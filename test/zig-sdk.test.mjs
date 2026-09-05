import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Zig SDK archive contains exactly its supported-target install roots", async () => {
  const roots = (await readFile(new URL("../config/zig-sdk-files.txt", import.meta.url), "utf8"))
    .split("\n").filter(line => line && !line.startsWith("#"));
  assert.equal(new Set(roots).size, roots.length);
  const files = execFileSync("tar", ["-tf",
    new URL("../dist/static/default/zig-lib.tar", import.meta.url).pathname], { encoding: "utf8" })
    .trimEnd().split("\n");
  const sdk = files.filter(path => path.startsWith("usr/lib/zig/"))
    .map(path => path.slice("usr/lib/zig/".length));
  assert.deepEqual([...new Set(sdk.map(path => path.split("/")[0]))].sort(), roots.sort());
  assert.deepEqual(files.filter(path => !path.startsWith("usr/lib/zig/")),
    ["usr/share/licenses/zig/LICENSE"]);
  for (const required of ["std/std.zig", "compiler/test_runner.zig", "compiler_rt.zig",
    "compiler_rt/udivmodti4_test.zig", "c.zig", "zig.h"]) assert.ok(sdk.includes(required), required);
});
