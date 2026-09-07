import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { updateRecipePins } from "../scripts/update-module-pins.mjs";

test("source archives are deterministic, complete under short writes, and own their staging", async t => {
  const scratch = await mkdtemp(join(tmpdir(), "dolly-source-tar-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const input = join(scratch, "input"), output = join(scratch, "source.tar");
  await mkdir(join(input, "nested"), { recursive: true });
  await writeFile(join(input, "a"), "source\n");
  const large = Buffer.alloc(200_001, 0x7f);
  await writeFile(join(input, "nested/b"), large);
  const script = new URL("../scripts/build-source-tar.mjs", import.meta.url).pathname;
  // A regular-file write can complete only part of its buffer. Do not let
  // the archive writer silently hash bytes it never actually wrote.
  const preload = `import { open } from 'node:fs/promises';
    const handle = await open(${JSON.stringify(join(input, "a"))}, 'r');
    const prototype = Object.getPrototypeOf(handle), write = prototype.write;
    prototype.write = function(bytes) { return write.call(this, bytes.subarray(0, Math.ceil(bytes.length / 2))); };
    await handle.close();`;
  const first = execFileSync(process.execPath, [script, output, input, "/usr/src/fixture"], { encoding: "utf8" });
  const expected = await readFile(output);
  const expectedHash = createHash("sha256").update(expected).digest("hex");
  const second = execFileSync(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(preload),
    script, output, input, "/usr/src/fixture"], { encoding: "utf8" });
  assert.equal(first, second);
  assert.equal(createHash("sha256").update(await readFile(output)).digest("hex"), expectedHash);
  assert.ok(first.includes(expectedHash));
  assert.deepEqual(execFileSync("tar", ["-xOf", output, "usr/src/fixture/nested/b"]), large);
  assert.equal(execFileSync("tar", ["-tf", output], { encoding: "utf8" }),
    "usr/src/fixture/a\nusr/src/fixture/nested/b\n");
  const octal = (offset, length) => Number.parseInt(expected.subarray(offset, offset + length).toString(), 8);
  for (const offset of [108, 116, 136]) assert.equal(octal(offset, offset === 136 ? 12 : 8), 0);
  assert.ok(expected.subarray(265, 329).every(byte => byte === 0), "archive retained a host owner name");
  assert.deepEqual((await readdir(scratch)).sort(), ["input", "source.tar"]);
});

test("source archives reject symlinks and clean failed staging without replacing previous output", async t => {
  const scratch = await mkdtemp(join(tmpdir(), "dolly-source-link-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const output = join(scratch, "source.tar"), input = join(scratch, "input");
  await mkdir(input);
  await writeFile(join(scratch, "private"), "not a declared source");
  await writeFile(output, "previous valid output");
  await symlink(join(scratch, "private"), join(input, "link"));
  const script = new URL("../scripts/build-source-tar.mjs", import.meta.url).pathname;
  for (const [path, destination] of [
    [join(input, "link"), "/usr/src/fixture"],
    [input, "/usr/src/fixture"],
    [join(scratch, "private"), "/" + "a".repeat(101)],
  ]) {
    const result = spawnSync(process.execPath, [script, output, path, destination], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsupported source input|reject non-file input|path does not fit ustar/);
    assert.equal(await readFile(output, "utf8"), "previous valid output");
  }
  assert.deepEqual((await readdir(scratch)).sort(), ["input", "private", "source.tar"]);
});

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
