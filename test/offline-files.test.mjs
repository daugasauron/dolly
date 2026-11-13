import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { offlineFiles } from "../scripts/offline-files.mjs";

test("the runtime a save keeps is the site's pages of sessions, code and kernel, and no image or seed", async t => {
  const site = await mkdtemp(resolve(tmpdir(), "dolly-offline-test-"));
  t.after(() => rm(site, { recursive: true, force: true }));
  const kept = ["dist/IosevkaTerm-SemiBold.woff2", "dist/dolly-images.json", "dist/dolly-process-0.wasm", "dist/dolly-runtime-worker.mjs",
    "dist/dolly.wasm", "host/modules.mjs", "host/snapshot/module.json", "session/index.html", "sessions/index.html",
    "src/route.css", "src/route.mjs"];
  const left = ["dist/dolly.data", "index.html", "default/index.html", "Dollyfile", "src/slop.c", "src/process/libc-adapter.c", "host/snapshot/kernel.c",
    "dist/dolly-default-system-snapshot.json", "dist/dolly-default-system-snapshot.mjs", "dist/dolly-default-system.snapshot",
    `dist/packs/${"a".repeat(64)}.snapshot.gz`, "dist/static/default/zig.tar", "dist/dolly-offline.json", "docs/sessions.md"];
  for (const path of [...kept, ...left]) {
    await mkdir(dirname(resolve(site, path)), { recursive: true });
    await writeFile(resolve(site, path), `bytes of ${path}`);
  }
  // A page is listed by its directory's address, which is what a browser asks for.
  const digest = path => createHash("sha256").update(`bytes of ${path}`).digest("hex");
  const expected = kept.map(path => [path.replace(/index\.html$/, ""), digest(path)]);
  assert.deepEqual(JSON.parse(await offlineFiles(site)), expected);
  // The checkout server lists among the paths it serves.
  assert.deepEqual(JSON.parse(await offlineFiles(site, ["src/route.mjs", "dist/packs/x", "session/index.html"])),
    [["session/", digest("session/index.html")], ["src/route.mjs", digest("src/route.mjs")]]);
});
