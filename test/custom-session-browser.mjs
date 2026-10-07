import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest } from "./browser.mjs";

const scratch = await mkdtemp(join(tmpdir(), "dolly-custom-session-"));
const status = page => page.evaluate(() => document.documentElement.dataset.dollyStatus);
async function boot(page) {
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await status(page), "ready", await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
}
async function rejected(page) {
  await page.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed");
}
const submit = (page, command) => page.evaluate(text => __dolly.submit(text), command);
async function check(page, commands) {
  for (const command of commands) assert.equal(await submit(page, command), 0, command);
}
// The saved IndexedDB record, with its payload reduced to a digest.
const stored = (page, name) => page.evaluate(async name => {
  const record = await (await import("/src/session-store.mjs")).loadStoredSession(name);
  return record && { ...record, bytes: [...new Uint8Array(await crypto.subtle.digest("SHA-256", record.bytes))] };
}, name);
async function newPage(context, rules) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  // A restricted embedding grants its fixtures again on every page.
  if (rules) await page.addInitScript(rules => { globalThis.DOLLY_HTTP_POLICY = { rules }; }, rules);
  return page;
}
async function customImageSessions(context, server, fixtures) {
  let page = await newPage(context, fixtures);
  await page.goto(server.origin + "/custom/");
  // The page's default recipe names its base and restates the base's host
  // modules (system retains the engine and the transfer tools).
  const original = await page.locator("#source").inputValue();
  const base = original.slice(0, original.indexOf("\nFILE ")).replace("APPLICATION custom", "APPLICATION custom-session");
  assert.match(base, /\nFROM https:\/\/daugasauron\.com\/Dollyfile-system [0-9a-f]{64}\n$/);
  const source = `${base}FILE /tmp/session-hello.c
    #include <stdio.h>
    int main(void) { puts("CUSTOM-SOURCE-BUILT"); return 0; }
SLOP cc /tmp/session-hello.c -o /usr/bin/session-hello
EXPORTS TOOL session-hello
FILE /usr/share/session-note
    BASE-NOTE
FILE /usr/share/session-delete
    DELETE-ME
ENTRY /bin/foreground -i /bin/slop
`;
  const verify = () => check(page, [
    'test "$(session-hello)" = CUSTOM-SOURCE-BUILT',
    "grep -q CUSTOM-SOURCE-BUILT /workspace/project/result",
    "grep -q CHANGED-NOTE /usr/share/session-note",
    "test ! -e /usr/share/session-delete",
    "test -L /workspace/result-link",
  ]);
  await page.locator("#source").fill("DOLLY 2");
  await page.locator("form button[type=submit]").click();
  assert.notEqual(await page.locator("#status").textContent(), "");
  assert.equal(new URL(page.url()).pathname, "/custom/");
  const oversized = join(scratch, "oversized");
  await writeFile(oversized, "x".repeat(128 * 1024 + 1));
  await page.locator("#dollyfile-upload").setInputFiles(oversized);
  assert.equal(await page.locator("#source").inputValue(), "DOLLY 2");
  await page.locator("#source").fill(source);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL("**/custom/rebuild/");
  await boot(page);
  await check(page, ['test "$(session-hello)" = CUSTOM-SOURCE-BUILT',
    "mkdir -p /workspace/project; session-hello > /workspace/project/result; printf CHANGED-NOTE > /usr/share/session-note; rm /usr/share/session-delete; ln -s /workspace/project/result /workspace/result-link"]);
  await page.keyboard.press("Control+Shift+s");
  await page.locator("#session-name").fill("custom-proof");
  await page.locator("#session-save").click();
  await page.waitForFunction(() => document.documentElement.dataset.sessionStatus === "saved");
  assert.equal(page.url(), `${server.origin}/session/?name=custom-proof`);
  const saved = await stored(page, "custom-proof");
  assert.equal(saved.image, "custom");
  assert.equal(saved.customImage.source, source);
  // Existing cached images stored ArrayBuffers directly.
  await page.evaluate(async () => {
    const record = await (await import("/src/session-store.mjs")).loadStoredSession("custom-proof");
    const artifact = await (await import("/src/image-artifact.mjs")).loadImageArtifact(record.customImage.artifact);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("dolly-image-artifacts-v3", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("payloads", "readwrite");
        tx.objectStore("payloads").put(artifact.bytes, artifact.buildId + ":" + artifact.recipeSha256);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  const rebuildPage = page;
  const popupPromise = page.waitForEvent("popup");
  await page.evaluate(async (custom) => {
    (await import("/src/custom-image.mjs")).openCustomImage(custom);
  }, { source: saved.customImage.source, artifact: saved.customImage.artifact, policies: saved.customImage.policies });
  page = await popupPromise;
  await boot(page);
  assert.equal(new URL(page.url()).pathname, "/custom/run/");
  await check(page, ["test ! -e /workspace/project/result", "printf RESULT-TAB > /workspace/result-tab"]);
  assert.equal(await page.evaluate(() => __dolly.saveSession("custom-result")), "custom-result");
  await page.close();
  page = await newPage(context);
  await page.goto(server.origin + "/session/?name=custom-result");
  await boot(page);
  await check(page, ["grep -q RESULT-TAB /workspace/result-tab"]);
  await page.close();
  await rebuildPage.close();
  page = await newPage(context, fixtures);
  await page.goto(server.origin + "/session/?name=custom-proof");
  await boot(page);
  await verify();
  await check(page, [`curl -fsS ${server.origin}/fixture/http.txt -o /tmp/http-proof`]);
  assert.notEqual(await submit(page, `curl -fsS ${server.origin}/denied`), 0);
  assert.equal(server.requests.has("/denied"), false);
  assert.deepEqual(await stored(page, "custom-proof"), saved);
  await page.evaluate(() => __dolly.saveSession());
  const resaved = await stored(page, "custom-proof");
  assert.deepEqual(resaved.customImage.artifact, saved.customImage.artifact);
  await page.goto(server.origin + "/sessions/");
  const row = page.locator("#sessions li").filter({ hasText: "custom-proof" });
  await row.locator("a").waitFor();
  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: "Export", exact: true }).click();
  const path = join(scratch, "custom-proof.dolly-session");
  await (await downloadPromise).saveAs(path);
  page.once("dialog", (dialog) => dialog.accept("custom-imported"));
  await page.locator("#import-session").setInputFiles(path);
  await page.locator("#sessions li").filter({ hasText: "custom-imported" }).locator("a").waitFor();
  const imported = await stored(page, "custom-imported");
  assert.deepEqual({ ...imported, name: "custom-proof" }, resaved);
  await page.close();
  page = await newPage(context, []);
  await page.goto(server.origin + "/session/?name=custom-imported");
  await boot(page);
  await verify();
  assert.notEqual(await submit(page, `curl -fsS ${server.origin}/fixture/http.txt`), 0);
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/fixture/http.txt"))), false);
  assert.deepEqual(await stored(page, "custom-imported"), imported);
  await page.evaluate(async () => {
    const store = await import("/src/session-store.mjs");
    const record = await store.loadStoredSession("custom-proof");
    record.name = "custom-wrong-source";
    record.customImage.source += "\n# changed source\n";
    await store.saveStoredSession(record);
  });
  await page.goto(server.origin + "/session/?name=custom-wrong-source");
  await rejected(page);
  assert.deepEqual(await stored(page, "custom-imported"), imported);
  await page.evaluate(async () => {
    const record = await (await import("/src/session-store.mjs")).loadStoredSession("custom-proof");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("dolly-image-artifacts-v3", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["images", "payloads"], "readwrite");
        const id = record.customImage.artifact.buildId + ":" + record.customImage.artifact.recipeSha256;
        tx.objectStore("images").delete(id);
        tx.objectStore("payloads").delete(id);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.goto(server.origin + "/session/?name=custom-imported");
  await rejected(page);
  assert.deepEqual(await stored(page, "custom-imported"), imported);
  await page.goto(server.origin + "/sessions/");
  const missing = page.locator("#sessions li").filter({ hasText: "custom-imported" });
  await missing.getByRole("button", { name: "Recover files", exact: true }).waitFor();
  assert.equal(await missing.locator("a").count(), 0);
  await missing.getByRole("button", { name: "Recover files", exact: true }).click();
  await boot(page);
  await check(page, ["grep -q CUSTOM-SOURCE-BUILT /workspace/recovered-custom-imported/workspace/project/result"]);
  assert.deepEqual(await stored(page, "custom-imported"), imported);
  await page.goto(server.origin + "/custom/");
  const recipePath = join(scratch, "Dollyfile");
  await writeFile(recipePath, source);
  await page.locator("#dollyfile-upload").setInputFiles(recipePath);
  await page.waitForFunction((text) => document.querySelector("#source").value === text, source);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL("**/custom/rebuild/");
  await boot(page);
  await page.goto(server.origin + "/session/?name=custom-imported");
  await boot(page);
  await verify();
  assert.deepEqual(await stored(page, "custom-imported"), imported);
  // A recipe whose ENTRY program is not retained fails its build, naming the fix.
  page = await newPage(context, fixtures);
  await page.goto(server.origin + "/custom/");
  await page.locator("#source").fill(source.replace("EXPORTS TOOL session-hello\n", "")
    .replace(/ENTRY .*/, "ENTRY /bin/foreground -i /usr/bin/session-hello"));
  await page.locator("form button[type=submit]").click();
  await page.waitForURL("**/custom/rebuild/");
  await rejected(page);
  assert.match(await page.locator("#bootstrap-log").textContent(),
    /ENTRY needs \/usr\/bin\/session-hello, which the image does not retain: add EXPORTS TOOL session-hello/);
  await context.close();
}

async function namedSessions(context, server, name) {
  const page = await newPage(context);
  // A rebuilt base carries a named save only when it is the packaged snapshot.
  await page.goto(server.origin + "/system/rebuild/");
  await boot(page);
  assert.equal(await page.evaluate(async () => {
    const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import("/dist/dolly-system-system-snapshot.mjs");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", __dolly.systemSnapshot));
    return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("") === metadata.sha256;
  }), true, "rebuilt session base differs from the packaged snapshot");
  assert.equal(await page.evaluate(async () => {
    const bytes = new Uint8Array(__dolly.systemSnapshot);
    bytes[bytes.length - 1] ^= 1;
    try { await __dolly.saveSession("wrong-rebuilt-base"); } catch {}
    finally { bytes[bytes.length - 1] ^= 1; }
    return (await import("/src/session-store.mjs")).loadStoredSession("wrong-rebuilt-base");
  }), null, "a changed rebuilt base produced a named save");
  await check(page, [
    "echo SESSION-WORKSPACE > /workspace/session-proof.txt",
    "echo SESSION-HOME > /home/dolly/session-proof.txt",
    `awk 'BEGIN { for (i = 0; i < 1024; i++) printf "%8192s", "x" }' > /workspace/session-large`,
    "echo '# SESSION-BASE-EDIT' >> /etc/gitconfig",
    "rm /usr/include/zconf.h",
    "rm /usr/share/licenses/zlib/LICENSE && mkdir /usr/share/licenses/zlib/LICENSE",
    "echo SESSION-TYPE > /usr/share/licenses/zlib/LICENSE/child",
    "mkdir /workspace/session-empty",
  ]);
  // Saving does not depend on the foreground program reading its input.
  const sleeping = submit(page, "sleep 20");
  await page.waitForFunction(() => __dolly.terminal.foregroundInterruptible());
  assert.equal(await page.evaluate(() => __dolly.saveSession("browser-proof")), "browser-proof");
  assert.equal(await Promise.race([sleeping, "sleeping"]), "sleeping", "the save waited for the foreground child");
  const delta = Number(await page.evaluate(() => document.documentElement.dataset.sessionUncompressedBytes));
  assert.ok(delta > 8 << 20 && delta < 12 << 20, `a save holds changes, not the base image: ${delta} bytes`);
  assert.equal(page.url(), `${server.origin}/session/?name=browser-proof`);
  await page.locator("#keyboard").focus();
  await page.keyboard.press("Control+c");
  assert.equal(await sleeping, 130);

  await page.goto(server.origin + "/session/?name=browser-proof");
  await boot(page);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.session,
    document.documentElement.dataset.sessionStatus]), ["browser-proof", "restored"]);
  await check(page, [
    "grep -q SESSION-WORKSPACE /workspace/session-proof.txt",
    "grep -q SESSION-HOME /home/dolly/session-proof.txt",
    "test $(wc -c < /workspace/session-large) -eq 8388608",
    "grep -q SESSION-BASE-EDIT /etc/gitconfig",
    "test ! -e /usr/include/zconf.h",
    "grep -q SESSION-TYPE /usr/share/licenses/zlib/LICENSE/child",
    "test -d /workspace/session-empty",
    "grep -q SESSION-WORKSPACE /home/dolly/.slop_history",
    "echo SECOND-SAVE >> /workspace/session-proof.txt && rm /workspace/session-large",
  ]);
  assert.equal(await page.evaluate(() => __dolly.saveSession()), "browser-proof");
  // A storage failure is visible and keeps the last good checkpoint.
  const checkpoint = await stored(page, "browser-proof");
  assert.equal(await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => { throw new DOMException("injected", "QuotaExceededError"); };
    try { await __dolly.saveSession(); } catch (error) { return error.name; }
    finally { IDBObjectStore.prototype.put = put; }
  }), "QuotaExceededError");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.sessionStatus), "failed");
  assert.ok(await page.locator("#session-status").isVisible());
  assert.deepEqual(await stored(page, "browser-proof"), checkpoint);
  await page.evaluate(async () => {
    const store = await import("/src/session-store.mjs");
    const good = await store.loadStoredSession("browser-proof");
    await store.saveStoredSession({ ...good, name: "wrong-base", buildId: "different-runtime" });
    await store.saveStoredSession({ ...good, name: "broken-data", encoding: "identity", bytes: new ArrayBuffer(16) });
  });
  for (const session of ["wrong-base", "broken-data", "missing-session"]) {
    await page.goto(`${server.origin}/session/?name=${session}`);
    await rejected(page);
  }

  // The list page manages saves without booting a runtime.
  await page.goto(server.origin + "/sessions/");
  await page.waitForFunction(() => document.documentElement.dataset.sessionsStatus === "ready");
  assert.equal(await page.evaluate(() => typeof __dolly), "undefined");
  const rows = () => page.locator("#sessions li").count();
  const row = session => page.locator("#sessions li").filter({ hasText: session });
  const idle = () => page.waitForFunction(() => !document.querySelector("#import-session").disabled);
  async function click(session, label, dialog) {
    if (dialog) page.once("dialog", dialog);
    await row(session).getByRole("button", { name: label, exact: true }).click();
    await idle();
  }
  const file = join(scratch, `${name}.dolly-session`);
  async function upload(answer) {
    page.once("dialog", dialog => answer === null ? dialog.dismiss() : dialog.accept(answer));
    await page.locator("#import-session").setInputFiles(file);
    await idle();
  }
  assert.equal(await rows(), 3);
  assert.equal(await row("wrong-base").locator("a").count(), 0);
  const exported = page.waitForEvent("download");
  await click("browser-proof", "Export");
  await (await exported).saveAs(file);
  await click("browser-proof", "Delete", dialog => dialog.dismiss());
  assert.equal(await rows(), 3, "a cancelled deletion removed the save");
  await click("browser-proof", "Delete", dialog => dialog.accept());
  assert.equal(await rows(), 2);
  await upload(null);
  await upload("../invalid");
  assert.equal(await rows(), 2, "a cancelled or invalid import wrote a save");
  const other = await stored(page, "broken-data");
  await upload("broken-data");
  assert.deepEqual(await stored(page, "broken-data"), other, "an import replaced an existing save");
  await upload("browser-proof");
  assert.equal(await rows(), 3);
  // The imported file restores, also through /session without its slash.
  await page.goto(`${server.origin}/session?name=browser-proof`);
  await boot(page);
  await check(page, ["grep -q SECOND-SAVE /workspace/session-proof.txt", "test ! -e /workspace/session-large"]);

  // An incompatible save is recovered as files into a fresh shell.
  const incompatible = await stored(page, "wrong-base");
  await page.goto(server.origin + "/sessions/");
  await row("wrong-base").getByRole("button", { name: "Recover files", exact: true }).click();
  await boot(page);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.image,
    document.documentElement.dataset.sessionStatus, __dolly.sessionName]), ["system", "recovered", null]);
  const recovered = "/workspace/recovered-wrong-base";
  await check(page, [
    `grep -q SECOND-SAVE ${recovered}/workspace/session-proof.txt`,
    `grep -q SESSION-HOME ${recovered}/home/dolly/session-proof.txt`,
    `test -d ${recovered}/workspace/session-empty`,
    `test ! -e ${recovered}/etc && test ! -e ${recovered}/usr`,
    "test ! -e /home/dolly/session-proof.txt && test -f /usr/include/zconf.h",
    "! grep -q SESSION-BASE-EDIT /etc/gitconfig",
  ]);
  assert.equal(await submit(page, `session-recover /tmp/missing ${recovered}`), 1);
  page.once("dialog", dialog => dialog.accept("recovered-copy"));
  assert.equal(await page.evaluate(() => __dolly.saveSession()), "recovered-copy");
  assert.deepEqual(await stored(page, "wrong-base"), incompatible, "recovery changed the original save");
  await page.goto(`${server.origin}/session/?name=broken-data&recover=1`);
  await rejected(page);
  assert.notEqual(await stored(page, "broken-data"), null);
  await context.close();
}

try {
  await browserTest("custom session", { image: "system", timeout: 300_000 }, async ({ name, browser, server }) => {
    await customImageSessions(await browser.newContext(), server, [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }]);
    await namedSessions(await browser.newContext(), server, name);
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
