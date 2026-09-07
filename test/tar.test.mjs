import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { tarArchive } from "./fixtures/tar.mjs";

test("tar extracts paths and stdin, preserves block padding, and rejects damaged input", async () => {
  const recipe = inspectDollyfile(await readFile(new URL("../modules/tar.dm", import.meta.url), "utf8"));
  const directory = await mkdtemp(join(tmpdir(), "dolly-tar-check-"));
  try {
    const binary = join(directory, "tar"), archivePath = join(directory, "input.tar");
    const compilation = spawnSync("cc", ["-std=c17", "-D_DEFAULT_SOURCE", "-Wall", "-Wextra", "-Werror", "-x", "c", "-", "-o", binary], {
      input: recipe.files.find(file => file.path.endsWith("/tar.c")).body, encoding: "utf8",
    });
    assert.equal(compilation.status, 0, compilation.stderr);
    for (const size of [0, 511, 512, 513]) {
      const contents = Buffer.from(Array.from({ length: size }, (_, index) => index % 256));
      const archive = tarArchive("nested/file", contents);
      assert.equal(spawnSync("tar", ["-tf", "-"], { input: archive }).status, 0);
      await writeFile(archivePath, archive);
      for (const input of [archivePath, "-"]) {
        const output = join(directory, `${size}-${input === "-" ? "stdin" : "path"}`);
        await mkdir(output);
        const result = spawnSync(binary, ["-xf", input, "-C", output], { input: archive });
        assert.equal(result.status, 0, result.stderr.toString());
        assert.deepEqual(await readFile(join(output, "nested/file")), contents);
      }
    }
    const archive = tarArchive("file", Buffer.from("data"));
    for (const truncated of [archive.subarray(0, 100), archive.subarray(0, 514)]) {
      assert.equal(spawnSync(binary, ["-xf", "-", "-C", directory], { input: truncated }).status, 1);
    }
    archive[0] ^= 1;
    assert.equal(spawnSync(binary, ["-xf", "-", "-C", directory], { input: archive }).status, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
