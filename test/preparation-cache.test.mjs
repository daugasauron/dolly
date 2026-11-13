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
    "config/source-pins.sh", "scripts/prepared-source.sh",
    "scripts/prepare-samurai.sh", "scripts/prepare-zig-native.sh",
    "config/zig-0.17.0-dolly-native.patch",
  ];
  // Execute only each key calculation, not a network fetch or compiler: zig-native's
  // part of its script, and the prepared sources' (scripts/prepared-source.sh) with
  // Samurai's inputs, whose tree's name ends with the key.
  const zigKey = async root => {
    const source = await readFile(join(root, "scripts/prepare-zig-native.sh"), "utf8");
    const boundary = source.indexOf("\nif [[");
    assert.ok(boundary > 0);
    const probe = join(root, "scripts/cache-probe.sh");
    await writeFile(probe, source.slice(0, boundary) + '\nprintf \'%s\\n\' "${recipe_digest}"\n');
    return execFileSync("bash", [probe], { encoding: "utf8" }).trim();
  };
  const preparedKey = root => execFileSync("bash", ["-c", 'project_dir="$1"; source "$1/scripts/prepared-source.sh"; ' +
    'prepared_source samurai pin "" "$1/scripts/prepare-samurai.sh"; printf "%s\\n" "${output_dir##*-}"', "key", root],
    { encoding: "utf8" }).trim();
  const recipes = [["prepare-samurai.sh", preparedKey], ["prepared-source.sh", preparedKey], ["prepare-zig-native.sh", zigKey]];
  const key = async (root, [, compute]) => {
    const digest = await compute(root);
    assert.match(digest, /^[0-9a-f]{16,64}$/);
    return digest;
  };
  try {
    for (const path of inputs) {
      await mkdir(dirname(join(original, path)), { recursive: true });
      await cp(new URL(`../${path}`, import.meta.url), join(original, path));
    }
    for (const name of ["fetch-pinned-checkout.sh", "fetch-zig.sh"]) {
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
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
