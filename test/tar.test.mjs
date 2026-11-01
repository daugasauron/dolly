import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { tarArchive } from "./fixtures/tar.mjs";

test("tar extracts paths and stdin, preserves block padding, and rejects damaged input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dolly-tar-check-"));
  try {
    const binary = join(directory, "tar"), archivePath = join(directory, "input.tar");
    const compilation = spawnSync("cc", ["-std=c17", "-D_DEFAULT_SOURCE", "-Wall", "-Wextra", "-Werror",
      new URL("../src/commands/tar.c", import.meta.url).pathname, "-o", binary], { encoding: "utf8" });
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
    const inputDirectory = join(directory, "input"), outputDirectory = join(directory, "output");
    await mkdir(inputDirectory); await mkdir(outputDirectory);
    await writeFile(join(inputDirectory, "file"), "upstream tar root");
    const upstream = spawnSync("tar", ["--format=ustar", "-cf", "-", "-C", inputDirectory, "."]);
    assert.equal(upstream.status, 0, upstream.stderr.toString());
    const extracted = spawnSync(binary, ["-xf", "-", "-C", outputDirectory], { input: upstream.stdout });
    assert.equal(extracted.status, 0, extracted.stderr.toString());
    assert.equal(await readFile(join(outputDirectory, "file"), "utf8"), "upstream tar root");
    // GNU tar's pax format: an extended header of times, without a path, before every member.
    const pax = spawnSync("tar", ["--format=pax", "-cf", "-", "-C", inputDirectory, "file"]);
    assert.equal(pax.status, 0, pax.stderr.toString());
    const paxOutput = join(directory, "pax-output");
    await mkdir(paxOutput);
    const paxExtracted = spawnSync(binary, ["-xf", "-", "-C", paxOutput], { input: pax.stdout });
    assert.equal(paxExtracted.status, 0, paxExtracted.stderr.toString());
    assert.equal(await readFile(join(paxOutput, "file"), "utf8"), "upstream tar root");
    for (const name of [".", "./", "././"]) {
      assert.equal(spawnSync(binary, ["-xf", "-", "-C", outputDirectory], { input: tarArchive(name, Buffer.alloc(0), "5") }).status, 0);
      assert.equal(spawnSync(binary, ["-xf", "-", "-C", outputDirectory], { input: tarArchive(name, Buffer.from("data")) }).status, 1);
      assert.equal(spawnSync(binary, ["-xf", "-", "-C", outputDirectory], { input: tarArchive(name, Buffer.from("data"), "5") }).status, 1);
    }
    assert.equal(spawnSync(binary, ["-xf", "-", "-C", outputDirectory], { input: tarArchive("", Buffer.alloc(0), "5") }).status, 1);
    const outside = join(directory, "outside");
    await writeFile(outside, "preserved");
    for (const name of ["../outside", "./../outside", "./a/../../outside", outside, ".//absolute", "./a\\b"]) {
      assert.equal(spawnSync(binary, ["-xf", "-", "-C", outputDirectory], { input: tarArchive(name, Buffer.from("changed")) }).status, 1, name);
    }
    assert.equal(await readFile(outside, "utf8"), "preserved");
    const archive = tarArchive("file", Buffer.from("data"));
    for (const truncated of [archive.subarray(0, 100), archive.subarray(0, 514)]) {
      assert.equal(spawnSync(binary, ["-xf", "-", "-C", directory], { input: truncated }).status, 1);
    }
    archive[0] ^= 1;
    assert.equal(spawnSync(binary, ["-xf", "-", "-C", directory], { input: archive }).status, 1);
    // What git archive and GNU tar write: a pax global header, and a member whose path
    // is longer than ustar holds, named by a pax record or a GNU long-name block.
    const entry = (name, contents, type) => tarArchive(name, contents, type).subarray(0, -1024);
    const record = (key, value) => {
      const text = ` ${key}=${value}\n`;
      let length = text.length + 2;
      while (String(length).length + text.length !== length) length++;
      return `${length}${text}`;
    };
    const deep = `${"d".repeat(120)}/${"f".repeat(120)}`;
    for (const [label, header] of [["pax", entry("PaxHeader", Buffer.from(record("path", deep)), "x")],
      ["GNU", entry("././@LongLink", Buffer.from(`${deep}\0`), "L")]]) {
      const long = Buffer.concat([entry("pax_global_header", Buffer.from(record("comment", "0123abcd")), "g"),
        header, entry(deep.slice(0, 99), Buffer.from(label)), Buffer.alloc(1024)]);
      const output = join(directory, `long-${label}`);
      await mkdir(output);
      const result = spawnSync(binary, ["-xf", "-", "-C", output], { input: long });
      assert.equal(result.status, 0, result.stderr.toString());
      assert.equal(await readFile(join(output, deep), "utf8"), label);
    }
    const escape = Buffer.concat([entry("PaxHeader", Buffer.from(record("path", "../outside")), "x"),
      entry("inside", Buffer.from("changed")), Buffer.alloc(1024)]);
    assert.equal(spawnSync(binary, ["-xf", "-", "-C", outputDirectory], { input: escape }).status, 1);
    assert.equal(await readFile(outside, "utf8"), "preserved");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
