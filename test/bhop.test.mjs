import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

test("the agent adapter preserves the original course, physics and game rendering", async () => {
  // Baseline: 48bdbfe, before the bhop agent adapter.
  const recipe = inspectDollyfile(await readFile(new URL("../modules/bhop.dm", import.meta.url), "utf8"));
  const source = name => recipe.files.find(file => file.path.endsWith(`/${name}`)).body;
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(source('bhop-movement.h')), 'c12d48f27d977eb1bd169290d06f94fa1a50bbd7a88303d85ebd962c4094a76f');
  assert.equal(hash(source('bhop-course.h')), '0c24988bf471c219dcd1191d3fa21b651a23f3705440cf15e3d01148e17ad285');
  const game = source('bhop.c');
  assert.equal(hash(game.slice(game.indexOf('enum { PLATFORM_COUNT'), game.indexOf('static int usage'))),
    'c82dc2fbd010a81b3265edd0a89efdfd497a7e79bdc10f587d947c52408b0fa6');
});

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
