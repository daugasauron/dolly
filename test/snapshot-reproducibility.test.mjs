import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { verifyReproducibility } from "../scripts/verify-snapshot-reproducibility.mjs";

function snapshot(value = 42) {
  const bytes = Buffer.alloc(35);
  bytes.write("DOLLYSNP"); bytes.writeUInt32LE(2, 8); bytes.writeUInt32LE(1, 12);
  bytes.writeUInt32LE(2, 16); bytes.writeUInt32LE(2, 20); bytes.writeBigUInt64LE(1n, 24);
  bytes.write("/x", 32); bytes[34] = value;
  return bytes;
}

for (const scenario of ["same", "changed", "malformed", "failed"]) {
  test(`reproducibility ${scenario}: isolated outputs/profiles, actual runs, owned cleanup`, async () => {
    const projectDir = await mkdtemp(resolve(tmpdir(), "dolly-repro-test-"));
    try {
      const dist = resolve(projectDir, "dist");
      await mkdir(dist);
      await writeFile(resolve(dist, "published.snapshot"), "last good image");
      const calls = [];
      const proof = verifyReproducibility({ projectDir, image: "fixture", runBuild: async options => {
        calls.push(options);
        if (scenario === "failed") throw new Error("browser failed");
        await writeFile(options.output, scenario === "malformed" ? "not a snapshot" :
          snapshot(scenario === "changed" ? calls.length : 42));
      } });
      if (scenario === "same") {
        assert.equal((await proof).size, 35);
        assert.equal(calls.length, 3);
        assert.equal(new Set(calls.map(call => call.output)).size, 3);
        assert.notEqual(calls[0].profile, calls[1].profile);
        assert.equal(calls[0].profile, calls[2].profile);
        assert.equal(calls[0].port, calls[2].port);
        assert.deepEqual(calls.map(call => call.state), ["cold", "cold", "warm"]);
      } else {
        await assert.rejects(proof, scenario === "changed" ? /cold-2 snapshot differs/ :
          scenario === "malformed" ? /snapshot header/ : /browser failed/);
        assert.equal(calls.length, scenario === "changed" ? 2 : 1);
      }
      assert.deepEqual(await readdir(dist), ["published.snapshot"]);
      assert.equal(await readFile(resolve(dist, "published.snapshot"), "utf8"), "last good image");
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });
}
