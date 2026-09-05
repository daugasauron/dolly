import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

test("preparation keys track their code and survive checkout relocation", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "dolly-preparation-keys-"));
  const original = join(scratch, "original");
  const relocated = join(scratch, "relocated");
  const inputs = [
    "config/source-pins.sh", "config/samurai-dolly.patch",
    "scripts/prepare-samurai.sh", "scripts/prepare-zig-native.sh",
    "scripts/build-native-zig.sh", "patches/zig-0.16.0-dolly-native.patch",
    "src/zig/native-main.zig", "src/zig/native-build-options.zig",
  ];
  const recipes = [
    ["prepare-samurai.sh", "recipe_hash"],
    ["prepare-zig-native.sh", "recipe_digest"],
    ["build-native-zig.sh", "object_digest"],
  ];
  // Execute only each script's key calculation, not a network fetch or compiler.
  const key = async (root, [script, variable]) => {
    const source = await readFile(join(root, "scripts", script), "utf8");
    const boundary = source.indexOf("\nif [[");
    assert.ok(boundary > 0);
    const probe = join(root, "scripts/cache-probe.sh");
    await writeFile(probe, source.slice(0, boundary) + '\nprintf \'%s\\n\' "${' + variable + '}"\n');
    const digest = execFileSync("bash", [probe], { encoding: "utf8" }).trim();
    assert.match(digest, /^[0-9a-f]{64}$/);
    return digest;
  };
  try {
    for (const path of inputs) {
      await mkdir(dirname(join(original, path)), { recursive: true });
      await cp(new URL(`../${path}`, import.meta.url), join(original, path));
    }
    for (const name of ["fetch-samurai.sh", "fetch-zig.sh"]) {
      await writeFile(join(original, "scripts", name), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    }
    await cp(original, relocated, { recursive: true });
    for (const recipe of recipes) {
      const baseline = await key(original, recipe);
      assert.equal(await key(relocated, recipe), baseline);
      const path = join(original, "scripts", recipe[0]);
      const source = await readFile(path, "utf8");
      await writeFile(path, `${source}\n# changed preparation\n`);
      assert.notEqual(await key(original, recipe), baseline);
      await writeFile(path, source);
    }
    const native = await key(original, recipes[2]);
    const preparation = join(original, "scripts/prepare-zig-native.sh");
    await writeFile(preparation, `${await readFile(preparation, "utf8")}\n# changed preparation\n`);
    assert.notEqual(await key(original, recipes[2]), native);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
