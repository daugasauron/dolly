import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

test("Airtime preserves air-strafe projection, landing momentum and swept hull collision", async () => {
  const recipe = inspectDollyfile(await readFile(new URL("../modules/bhop.dm", import.meta.url), "utf8"));
  const source = name => recipe.files.find(file => file.path.endsWith(`/${name}`)).body;
  const directory = await mkdtemp(join(tmpdir(), "dolly-bhop-check-"));
  try {
    const binary = join(directory, "check");
    const compilation = spawnSync("cc", ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-x", "c", "-", "-lm", "-o", binary], {
      input: source("bhop-movement.h") + source("bhop-course.h").replace('#include "bhop-movement.h"', "") +
        source("bhop-check.c").replace('#include "bhop-course.h"', ""), encoding: "utf8",
    });
    assert.equal(compilation.status, 0, compilation.stderr);
    const check = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 });
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /synchronized strafe 4[2-9][0-9]/);
    assert.match(check.stdout, /landing momentum and swept wall sliding passed/);
    assert.match(check.stdout, /100ms collapse, 2s return, safe checkpoints and immediate jumping passed/);
    assert.match(check.stdout, /all 32 individual gaps reachable/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
