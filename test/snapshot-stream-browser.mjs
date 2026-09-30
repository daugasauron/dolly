import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { browserTest } from "./browser.mjs";
import { decodeSnapshotRecords, encodeSnapshotRecords } from "../src/snapshot-records.mjs";
import { DOLLY_SYSTEM_SNAPSHOT as original } from "../dist/dolly-default-system-snapshot.mjs";

// Interleaved records and reversed parts require the canonical image hash, not
// the digest of a concatenation or the last successful download.
const records = decodeSnapshotRecords(await readFile(new URL("../dist/dolly-default-system.snapshot", import.meta.url)));
const groups = [new Map(), new Map()];
let index = 0;
for (const [path, record] of records) groups[index++ % 2].set(path, record);
const bodies = new Map(), parts = [];
for (const group of groups) {
  const bytes = encodeSnapshotRecords(group), sha256 = createHash("sha256").update(bytes).digest("hex");
  const body = gzipSync(bytes);
  parts.push({ sha256, byteLength: bytes.length, encodedByteLength: body.length });
  bodies.set(sha256, body);
}
const metadata = { ...original, encoding: "packs", packs: parts.reverse() };
const sourceOverrides = new Map();

await browserTest("snapshot stream", { server: { sourceOverrides } }, async ({ browser, server }) => {
  for (const scenario of ["valid", "wrong-image-digest", "wrong-pack-digest", "truncated"]) {
    const candidate = structuredClone(metadata);
    if (scenario === "wrong-image-digest") candidate.sha256 = "0".repeat(64);
    if (scenario === "wrong-pack-digest") candidate.packs[0].sha256 = "f".repeat(64);
    sourceOverrides.set("/dist/dolly-default-system-snapshot.mjs", `export const DOLLY_SYSTEM_SNAPSHOT = ${JSON.stringify(candidate)};`);
    const page = await browser.newPage();
    page.setDefaultTimeout(45_000);
    // The runtime must never start (post "ready") from an unverified image.
    await page.addInitScript(() => {
      globalThis.streamReady = false;
      globalThis.Worker = class extends Worker {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", ({ data }) => { if (data.type === "ready") streamReady = true; });
        }
      };
    });
    await page.route("**/dist/packs/*.snapshot.gz", route => {
      const body = bodies.get(route.request().url().split("/").at(-1).split(".")[0]) ?? bodies.get(metadata.packs[0].sha256);
      return route.fulfill({ contentType: "application/octet-stream",
        body: scenario === "truncated" ? body.subarray(0, body.length - 10) : body });
    });
    await page.goto(`${server.origin}/default/`);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
    const valid = scenario === "valid";
    assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.dollyStatus, streamReady]),
      [valid ? "ready" : "failed", valid], scenario);
    if (valid) {
      await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "streamed shell"));
      assert.equal(await page.evaluate(() => __dolly.submit("test \"$(cat /etc/dolly/image)\" = default")), 0);
    }
    await page.close();
  }
});
