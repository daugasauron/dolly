import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { updateRecipePins } from "../scripts/update-module-pins.mjs";

test("prepared CPython configuration keeps bootstrap paths independent of the builder's home", () => {
  const archive = new URL("../dist/static/python/cpython.tar", import.meta.url).pathname;
  for (const name of ["Makefile", "Makefile.pre", "config.status"]) {
    const configuration = execFileSync("tar", ["-xOf", archive, `usr/src/python/${name}`], { encoding: "utf8" });
    assert.ok(configuration.includes("--with-build-python=/opt/dolly-build-python/bin/python3.14"), name);
    assert.equal(/\/(?:home|Users)\/|\/src\/build\/generated\/cpython-source\./.test(configuration), false, name);
  }
});

test("prepared HOST bytes update module and image pins without changing URL pins", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "dolly-image-source-"));
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  const pin = "0".repeat(64);
  try {
    await mkdir(join(scratch, "modules"));
    await mkdir(join(scratch, "dist/static"), { recursive: true });
    await writeFile(join(scratch, "Dollyfile"), `DOLLY 3\nIMAGE default\nUSE HOST /modules/tool.dm ${pin}\nENTRY /bin/slop\n`);
    await writeFile(join(scratch, "Dollyfile-addon"), `DOLLY 3\nIMAGE addon\nFROM HOST /Dollyfile ${pin}\nENTRY /bin/slop\n`);
    await writeFile(join(scratch, "modules/tool.dm"), `DOLLY 3\nMODULE tool\nSOURCE HOST /static/tool.c /tmp/tool.c ${pin}\nSOURCE URL https://example.invalid/source /tmp/upstream ${pin}\n`);
    for (const bytes of ["first source", "edited source"]) {
      await writeFile(join(scratch, "dist/static/tool.c"), bytes);
      await updateRecipePins(scratch, true);
      const module = await readFile(join(scratch, "modules/tool.dm"), "utf8");
      const base = await readFile(join(scratch, "Dollyfile"), "utf8");
      const addon = await readFile(join(scratch, "Dollyfile-addon"), "utf8");
      assert.ok(module.includes(`/tmp/tool.c ${digest(bytes)}`));
      assert.ok(module.includes(`/tmp/upstream ${pin}`));
      assert.ok(base.includes(digest(module)));
      assert.ok(addon.includes(digest(base)));
      await updateRecipePins(scratch, true);
      assert.equal(await readFile(join(scratch, "Dollyfile-addon"), "utf8"), addon);
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test("pinned Git sources reject modified, staged, untracked and ignored bytes without deleting them", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "dolly-source-verification-"));
  const git = (...args) => execFileSync("git", ["-C", scratch, ...args], { encoding: "utf8" }).trim();
  const verifier = new URL("../scripts/verify-git-source.sh", import.meta.url).pathname;
  try {
    git("init", "--quiet");
    await writeFile(join(scratch, "source.c"), "upstream\n");
    await writeFile(join(scratch, ".gitignore"), "ignored.c\n");
    git("add", ".");
    git("-c", "user.name=Dolly", "-c", "user.email=dolly@example.invalid", "commit", "--quiet", "-m", "fixture");
    const commit = git("rev-parse", "HEAD");
    const verify = (pin = commit) => spawnSync("bash", [verifier, scratch, pin], { encoding: "utf8" });
    assert.equal(verify().status, 0);
    assert.equal(verify("0".repeat(40)).status, 1);
    for (const name of ["source.c", "untracked.c", "ignored.c"]) {
      await writeFile(join(scratch, name), "changed\n");
      const result = verify();
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, /local source changes/);
      assert.equal(await readFile(join(scratch, name), "utf8"), "changed\n");
      if (name === "source.c") {
        git("add", name);
        assert.equal(verify().status, 1, "staged change");
        await writeFile(join(scratch, name), "upstream\n");
        git("add", name);
      } else await rm(join(scratch, name));
      assert.equal(verify().status, 0);
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test("a declared patch is the only accepted difference in a sparse upstream checkout", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "dolly-patched-source-"));
  const source = join(scratch, "upstream");
  const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" });
  try {
    await mkdir(join(source, "kept"), { recursive: true });
    await mkdir(join(source, "omitted"));
    await writeFile(join(source, "kept/source.c"), "upstream\n");
    await writeFile(join(source, "omitted/source.c"), "outside sparse selection\n");
    git("init", "--quiet");
    git("add", ".");
    git("-c", "user.name=Dolly", "-c", "user.email=dolly@example.invalid", "commit", "--quiet", "-m", "fixture");
    const commit = git("rev-parse", "HEAD").trim();
    git("sparse-checkout", "init", "--cone");
    git("sparse-checkout", "set", "kept");
    await writeFile(join(source, "kept/source.c"), "declared target change\n");
    const patch = join(scratch, "target.patch");
    await writeFile(patch, git("diff", "--binary"));
    const index = await readFile(join(source, ".git/index"));
    const verify = () => spawnSync("bash", [
      new URL("../scripts/verify-git-source.sh", import.meta.url).pathname, source, commit, patch,
    ], { encoding: "utf8" });
    assert.equal(verify().status, 0);
    assert.deepEqual(await readFile(join(source, ".git/index")), index, "verification rewrote the real index");
    await writeFile(join(source, "kept/source.c"), "declared target change\nundeclared change\n");
    assert.equal(verify().status, 1);
    assert.match(await readFile(join(source, "kept/source.c"), "utf8"), /undeclared change/);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
