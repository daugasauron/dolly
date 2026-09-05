import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

test("process archive publication preserves identical output and owns failed staging", async () => {
  const source = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const start = source.indexOf("(\n  process_archive_staging=");
  const end = source.indexOf("\n\nbuild_process()", start);
  assert.ok(start > 0 && end > start);
  const fragment = source.slice(start, end);
  const objects = [...new Set(fragment.match(/build\/process-[a-z_-]+\.o/g))];
  assert.ok(objects.length > 1);
  const scratch = await mkdtemp(join(tmpdir(), "dolly-process-archive-"));
  const execute = promisify(execFile);
  const publish = (fail = false) => execute("bash", ["-euo", "pipefail", "-c",
    `dolly_ar() { shift; ar "$@"; ${fail ? "return 42;" : ""} }\ncontainer=(dolly_ar)\n${fragment}`,
  ], { cwd: scratch });
  try {
    await mkdir(join(scratch, "build"));
    for (const name of objects) await writeFile(join(scratch, name), "object fixture\n");
    const archive = join(scratch, "build/libdolly-process.a");
    await writeFile(join(scratch, "obsolete.o"), "obsolete object\n");
    await execute("ar", ["rcsD", archive, ...objects.toReversed().map(name => join(scratch, name)),
      join(scratch, "obsolete.o")]);
    await publish();
    assert.deepEqual((await execute("ar", ["t", archive])).stdout.trimEnd().split("\n"),
      objects.map(name => name.slice("build/".length)), "existing archives must not preserve historical order or removed members");
    const first = await readFile(archive);
    const timestamp = (await stat(archive, { bigint: true })).mtimeNs;
    await publish();
    assert.deepEqual(await readFile(archive), first);
    assert.equal((await stat(archive, { bigint: true })).mtimeNs, timestamp);
    await writeFile(join(scratch, objects[0]), "changed object fixture\n");
    await assert.rejects(publish(true), error => error.code === 42);
    assert.deepEqual(await readFile(archive), first, "failed producer must leave the last good archive");
    assert.equal((await stat(archive, { bigint: true })).mtimeNs, timestamp);
    assert.equal((await readdir(join(scratch, "build"))).some(name => name.startsWith(".process-archive.")), false);
    await publish();
    assert.notDeepEqual(await readFile(archive), first);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
