import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
