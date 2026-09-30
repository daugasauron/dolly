import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { stagedIncludeDirectory } from "../scripts/host-modules.mjs";
const includeDirectory = await stagedIncludeDirectory();

test("artifact reads stay bounded, preserve ranges and reject malformed snapshots", async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-artifact-"));
  try {
    const project = resolve(import.meta.dirname, ".."), program = resolve(scratch, "parser");
    execFileSync("cc", ["-std=c11", "-O1", "-I", includeDirectory,
      resolve(project, "test/fixtures/dollyfile-parser.c"), "-o", program]);
    const recipe = Buffer.from("DOLLY 4\nIMAGE artifact-proof\nENTRY /bin/slop\n");
    const pin = createHash("sha256").update(recipe).digest("hex");
    const base = [[1, "/etc", ""], [1, "/etc/dolly", ""], [2, "/etc/dolly/Dollyfile", recipe],
      [1, "/usr", ""], [1, "/usr/share", ""]];
    const snapshot = async (name, records, trailing = "") => {
      const path = resolve(scratch, name), file = await open(path, "w");
      try {
        let offset = 0;
        const append = async bytes => { await file.write(bytes, 0, bytes.length, offset); offset += bytes.length; };
        const header = Buffer.alloc(16);header.write("DOLLYSNP");header.writeUInt32LE(2, 8);header.writeUInt32LE(records.length, 12);
        await append(header);
        for (const [kind, path, value] of records) {
          const name = Buffer.from(path), sparse = typeof value === "number";
          const data = sparse ? null : Buffer.from(value), length = sparse ? value : data.length;
          const record = Buffer.alloc(16);record.writeUInt32LE(kind);record.writeUInt32LE(name.length, 4);
          record.writeBigUInt64LE(BigInt(length), 8);
          await append(record);await append(name);
          if (sparse) offset += length; else await append(data);
        }
        await append(Buffer.from(trailing));await file.truncate(offset);
      } finally { await file.close(); }
      return path;
    };
    const run = (path, ...args) => spawnSync(program, ["read-artifact", path, pin, ...args], { encoding: "utf8" });
    const payload = Buffer.from(Array.from({ length: 65543 }, (_, i) => (i * 17 + 7) % 251));
    const large = await snapshot("large", [...base,
      [2, "/usr/share/a-large", 1280 * 1024 * 1024], [2, "/usr/share/b-large", 256 * 1024 * 1024],
      [2, "/usr/share/empty", ""], [2, "/usr/share/tail", payload], [3, "/usr/share/z-link", "tail"]]);
    assert.equal(run(large).status, 0, "1.5 GiB artifact and a 1.25 GiB file under a 64 MiB address-space limit");
    const destination = resolve(scratch, "copied");
    for (const [name, expected] of [["tail", payload], ["empty", Buffer.alloc(0)]]) {
      await writeFile(destination, "old contents");
      assert.equal(run(large, "/usr/share/" + name, destination).status, 0);
      assert.deepEqual(await readFile(destination), expected);
    }
    for (const [name, records, trailing] of [
      ["trailing", base, "x"], ["duplicate", [...base, [2, "/usr/share/z", ""], [2, "/usr/share/z", ""]]],
      ["unsorted", [...base].reverse()], ["directory-data", [...base, [1, "/usr/share/z", "x"]]],
      ["symlink-nul", [...base, [3, "/usr/share/z", "a\0b"]]], ["empty-link", [...base, [3, "/usr/share/z", ""]]],
      ["path-nul", [...base, [2, "/usr/share/z\0hidden", ""]]], ["dotdot", [...base, [2, "/usr/share/z/../bad", ""]]],
      ["missing-recipe", [...base.slice(0, 2), ...base.slice(3)]],
    ]) assert.notEqual(run(await snapshot(name, records, trailing)).status, 0, name);
    assert.notEqual(spawnSync(program, ["read-artifact", large, "0".repeat(64)]).status, 0);
    const truncated = await snapshot("truncated", [...base, [2, "/usr/share/z", "123456789"]]);
    await truncate(truncated, (await stat(truncated)).size - 1);
    assert.notEqual(run(truncated).status, 0, "truncated last record");
    const oversized = await snapshot("oversized", base);
    await truncate(oversized, 2 * 1024 * 1024 * 1024 + 1);
    assert.notEqual(run(oversized).status, 0, "artifact exceeds 2 GiB");
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
