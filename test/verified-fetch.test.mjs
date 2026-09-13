import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
const run = promisify(execFile);

test("verified downloads recover from interruption without publishing partial or unverified files", async t => {
  const root = await mkdtemp(join(tmpdir(), "dolly-download-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const complete = Buffer.from("complete source archive"), partial = Buffer.from("partial");
  const hash = createHash("sha256").update(complete).digest("hex");
  let requests = 0, response = "interrupted";
  const server = createServer((request, reply) => {
    requests++;
    const body = response === "complete" ? complete : partial;
    reply.writeHead(200, { "Content-Length": response === "interrupted" ? complete.length : body.length, Connection: "close" });
    reply.end(body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const directory of ["scripts", "config"]) await mkdir(join(root, directory));
  for (const name of ["fetch-verified-file.sh", "fetch-typescript.sh"])
    await cp(new URL(`../scripts/${name}`, import.meta.url), join(root, "scripts", name));
  const url = `http://127.0.0.1:${server.address().port}/source`;
  await writeFile(join(root, "config/source-pins.sh"),
    `DOLLY_TYPESCRIPT_VERSION=fixture\nDOLLY_TYPESCRIPT_URL=${url}\nDOLLY_TYPESCRIPT_SHA256=${hash}\n`);
  const fetch = () => run("bash", [join(root, "scripts/fetch-typescript.sh")]);
  const cache = join(root, ".cache"), archive = join(cache, "typescript-fixture.tgz");
  await assert.rejects(fetch(), error => error.code === 18);
  assert.deepEqual(await readdir(cache), []);
  response = "complete";
  assert.equal((await fetch()).stdout.trim(), archive);
  assert.equal(requests, 2);
  assert.deepEqual(await readFile(archive), complete);
  const before = await stat(archive);
  await fetch();
  assert.equal(requests, 2);
  assert.equal((await stat(archive)).mtimeMs, before.mtimeMs);

  const borrowed = join(root, "borrowed-source");
  await writeFile(borrowed, "old corrupt cache");
  await rm(archive);
  await symlink(borrowed, archive);
  response = "wrong checksum";
  await assert.rejects(fetch(), /downloaded source checksum mismatch/);
  assert.equal((await lstat(archive)).isSymbolicLink(), true);
  assert.equal(await readFile(archive, "utf8"), "old corrupt cache");
  assert.deepEqual(await readdir(cache), ["typescript-fixture.tgz"]);
  response = "complete";
  await fetch();
  assert.equal((await lstat(archive)).isSymbolicLink(), false);
  assert.deepEqual(await readFile(archive), complete);
  assert.equal(await readFile(borrowed, "utf8"), "old corrupt cache");
  await rm(archive);
  await mkdir(archive);
  const priorRequests = requests;
  await assert.rejects(fetch(), /source cache target is not a file/);
  assert.equal(requests, priorRequests);
  assert.deepEqual(await readdir(cache), ["typescript-fixture.tgz"]);
});
