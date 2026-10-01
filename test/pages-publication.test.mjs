import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Pages verifies the user-selected artifact digest before extraction", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /artifact_sha256:\n[^\n]*\n\s+required: true/);
  assert.match(workflow, /EXPECTED_SHA256: \$\{\{ inputs\.artifact_sha256 \}\}\n\s+run: bash _source\/scripts\/verify-sha256\.sh "\$\{EXPECTED_SHA256\}" dolly-pages\.tar\.gz/);
  const scratch = await mkdtemp(join(tmpdir(), "dolly-pages-digest-"));
  try {
    const archive = join(scratch, "dolly-pages.tar.gz");
    const bytes = Buffer.from("the selected release artifact");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const script = new URL("../scripts/verify-sha256.sh", import.meta.url).pathname;
    const verify = value => execFileSync("bash", [script, value, "dolly-pages.tar.gz"], { cwd: scratch, stdio: "pipe" });
    await writeFile(archive, bytes);
    assert.match(verify(digest).toString(), /dolly-pages.tar.gz: OK/);
    assert.throws(() => verify(""));
    assert.throws(() => verify("not a digest"));
    assert.throws(() => verify(`${digest}\n${digest}`));
    await writeFile(archive, "changed release artifact");
    assert.throws(() => verify(digest));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
