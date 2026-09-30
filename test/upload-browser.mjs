import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest } from "./browser.mjs";
import { UPLOAD_CANCEL_QUIET_MILLISECONDS } from "../src/upload-transport.mjs";

// `upload` copies one user-chosen file into Dolly; it never overwrites, and
// cancelling the picker or the command leaves nothing behind.
const scratch = await mkdtemp(join(tmpdir(), "dolly-upload-test-"));
const bytes = Buffer.from(Uint8Array.from({ length: 150000 }, (_, index) => index & 255));
const binary = join(scratch, "日本語.bin"), empty = join(scratch, "empty");
await writeFile(binary, bytes);
await writeFile(empty, "");
try {
  await browserTest("upload", { server: { fixtures: { "upload-race.c": "test/fixtures/upload-race.c" } } }, async ({ server, open }) => {
    const { page, submit, waitForText } = await open({ policy: {
      rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
    const picker = page.locator("#file-upload[open]");
    // Resolves once the picker is open, to the command's pending status.
    const start = async command => {
      const status = submit(command);
      await picker.waitFor();
      return [status];
    };
    const focused = () => page.evaluate(() => document.activeElement.id);

    let [status] = await start("upload /workspace/upload.bin");
    assert.equal(await page.locator("#file-upload input").evaluate(input => input.files.length), 0);
    await page.locator("#file-upload input").setInputFiles(binary);
    assert.equal(await status, 0);
    assert.equal(await focused(), "keyboard");
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(await submit(`test "$(sha256sum /workspace/upload.bin | cut -d ' ' -f 1)" = ${digest}`), 0);
    assert.equal(await submit("upload /workspace/upload.bin"), 1, "upload overwrote a file");
    assert.equal(await picker.count(), 0);

    assert.equal(await submit(`curl -fsS ${server.origin}/fixture/upload-race.c -o /tmp/upload-race.c && cc -O0 /tmp/upload-race.c -o /tmp/upload-race`), 0);
    [status] = await start("/tmp/upload-race");
    await waitForText(/(?:^|\n)UPLOAD-RACE-READY(?:\n|$)/);
    await page.locator("#file-upload input").setInputFiles(binary);
    assert.equal(await status, 1, "upload replaced a file created while choosing");
    assert.equal(await submit("test \"$(cat /workspace/upload-race)\" = 'created while selecting'"), 0);

    [status] = await start("upload /workspace/upload-empty");
    await page.locator("#file-upload input").setInputFiles(empty);
    assert.equal(await status, 0);
    assert.equal(await submit("test -f /workspace/upload-empty && test ! -s /workspace/upload-empty"), 0);

    [status] = await start("upload /workspace/upload-cancelled");
    await page.keyboard.press("Escape");
    assert.equal(await status, 1);
    // Right after a user cancel, a request fails without reopening the picker.
    assert.equal(await submit("upload /workspace/upload-cancelled"), 1);
    assert.equal(await picker.count(), 0);
    assert.equal(await submit("test ! -e /workspace/upload-cancelled"), 0);
    await page.waitForTimeout(UPLOAD_CANCEL_QUIET_MILLISECONDS);

    [status] = await start("upload /workspace/upload-interrupted");
    await page.keyboard.press("Control+c");
    assert.equal(await status, 130);
    await picker.waitFor({ state: "detached" });
    assert.equal(await focused(), "keyboard");
    assert.equal(await submit("test ! -e /workspace/upload-interrupted && test -z \"$(find /tmp -name 'dolly-upload-*')\""), 0,
      "cancelled uploads must remove their scratch files");
    assert.equal(await submit("rm /workspace/upload.bin /workspace/upload-race /workspace/upload-empty /tmp/upload-race /tmp/upload-race.c"), 0);
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
