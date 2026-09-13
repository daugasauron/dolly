import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBrowserServer } from "./browser-server.mjs";

const names = process.argv.slice(2);
if (!names.length) names.push("chromium", "firefox");
if (names.some((name) => !["chromium", "firefox"].includes(name))) throw new Error("usage: node test/custom-session-browser.mjs [chromium|firefox ...]");
const server = await startBrowserServer(new URL("..", import.meta.url).pathname);
const scratch = await mkdtemp(join(tmpdir(), "dolly-custom-session-"));
try {
  for (const name of names) {
    const started = performance.now();
    const browser = await { chromium, firefox }[name].launch(name === "chromium" ? { channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] } : { headless: true });
    const timer = setTimeout(() => void browser.close(), 180000);
    const context = await browser.newContext();
    let page;
    try {
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.addInitScript((origin) => {
        globalThis.DOLLY_HTTP_POLICY = { rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
      }, server.origin);
      await page.goto(server.origin + "/custom/");
      const original = await page.locator("#source").inputValue();
      const pin = original.match(/FROM HOST \/Dollyfile-system ([0-9a-f]{64})/)[1];
      const source = `DOLLY 3
IMAGE custom-session
FROM HOST /Dollyfile-system ${pin}
FILE /tmp/session-hello.c
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
      const boot = async () => {
        await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
        assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready", await page.locator("#bootstrap-log").textContent());
        await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "custom session shell"));
      };
      const submit = (command) => page.evaluate((text) => __dolly.submit(text), command);
      const check = async () => {
        for (const command of [
          'test "$(session-hello)" = CUSTOM-SOURCE-BUILT',
          "grep -q CUSTOM-SOURCE-BUILT /workspace/project/result",
          "grep -q CHANGED-NOTE /usr/share/session-note",
          "test ! -e /usr/share/session-delete",
          "test -L /workspace/result-link"
        ]) assert.equal(await submit(command), 0, command);
      };
      await page.locator("#source").fill("DOLLY 2");
      await page.locator("form button[type=submit]").click();
      assert.match(await page.locator("#status").textContent(), /DOLLY 3/);
      assert.equal(new URL(page.url()).pathname, "/custom/");
      const oversized = join(scratch, "oversized");
      await writeFile(oversized, "x".repeat(128 * 1024 + 1));
      await page.locator("#dollyfile-upload").setInputFiles(oversized);
      await page.getByText(/Dollyfile exceeds 128 KiB/).waitFor();
      await page.locator("#source").fill(source);
      await page.locator("form button[type=submit]").click();
      await page.waitForURL("**/custom/rebuild/");
      await boot();
      assert.equal(await submit('test "$(session-hello)" = CUSTOM-SOURCE-BUILT'), 0);
      assert.equal(await submit("mkdir -p /workspace/project; session-hello > /workspace/project/result; printf CHANGED-NOTE > /usr/share/session-note; rm /usr/share/session-delete; ln -s /workspace/project/result /workspace/result-link"), 0);
      page.once("dialog", (dialog) => dialog.accept("custom-proof"));
      await page.keyboard.press("Control+Shift+s");
      await page.waitForFunction(() => document.documentElement.dataset.sessionStatus === "saved");
      assert.equal(new URL(page.url()).pathname, "/session/custom-proof");
      const store = async (target = "custom-proof") => page.evaluate(async (sessionName) => {
        const record = await (await import("/src/session-store.mjs")).loadStoredSession(sessionName);
        return { ...record, bytes: [...new Uint8Array(await crypto.subtle.digest("SHA-256", record.bytes))] };
      }, target);
      const saved = await store();
      assert.equal(saved.image, "custom");
      assert.equal(saved.customImage.source, source);
      const rebuildPage = page;
      const popupPromise = page.waitForEvent("popup");
      await page.evaluate(async (custom) => {
        (await import("/src/custom-image.mjs")).openCustomImage(custom);
      }, { source: saved.customImage.source, artifact: saved.customImage.artifact, policies: saved.customImage.policies });
      page = await popupPromise;
      await boot();
      assert.equal(new URL(page.url()).pathname, "/custom/run/");
      assert.equal(await submit("test ! -e /workspace/project/result"), 0);
      assert.equal(await submit("printf RESULT-TAB > /workspace/result-tab"), 0);
      assert.equal(await page.evaluate(() => __dolly.saveSession("custom-result")), "custom-result");
      await page.close();
      page = await context.newPage();
      await page.goto(server.origin + "/session/custom-result");
      await boot();
      assert.equal(await submit("grep -q RESULT-TAB /workspace/result-tab"), 0);
      await page.close();
      await rebuildPage.close();
      page = await context.newPage();
      await page.goto(server.origin + "/session/custom-proof");
      await boot();
      await check();
      assert.equal(await submit(`curl -fsS ${server.origin}/fixture/http.txt -o /tmp/http-proof`), 0);
      assert.notEqual(await submit(`curl -fsS ${server.origin}/denied`), 0);
      assert.equal(server.requests.has("/denied"), false);
      assert.deepEqual(await store(), saved);
      await page.evaluate(() => __dolly.saveSession());
      const resaved = await store();
      assert.deepEqual(resaved.customImage.artifact, saved.customImage.artifact);
      await page.goto(server.origin + "/session/");
      const row = page.locator("#sessions li").filter({ hasText: "custom-proof" });
      await row.locator("a").waitFor();
      const downloadPromise = page.waitForEvent("download");
      await row.getByRole("button", { name: "Export", exact: true }).click();
      const download = await downloadPromise;
      const path = join(scratch, name + ".dolly-session");
      await download.saveAs(path);
      page.once("dialog", (dialog) => dialog.accept("custom-imported"));
      await page.locator("#import-session").setInputFiles(path);
      await page.locator("#sessions li").filter({ hasText: "custom-imported" }).locator("a").waitFor();
      const imported = await store("custom-imported");
      assert.deepEqual({ ...imported, name: "custom-proof" }, resaved);
      await page.close();
      page = await context.newPage();
      await page.addInitScript(() => {
        globalThis.DOLLY_HTTP_POLICY = { rules: [] };
      });
      await page.goto(server.origin + "/session/custom-imported");
      await boot();
      await check();
      assert.notEqual(await submit(`curl -fsS ${server.origin}/fixture/http.txt`), 0);
      assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/fixture/http.txt"))), false);
      assert.deepEqual(await store("custom-imported"), imported);
      await page.evaluate(async () => {
        const store2 = await import("/src/session-store.mjs");
        const record = await store2.loadStoredSession("custom-proof");
        record.name = "custom-wrong-source";
        record.customImage.source += "\n# changed source\n";
        await store2.saveStoredSession(record);
      });
      await page.goto(server.origin + "/session/custom-wrong-source");
      await page.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed");
      assert.match(await page.locator("#bootstrap-log").textContent(), /does not match this Dollyfile/);
      assert.deepEqual(await store("custom-imported"), imported);
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
      await page.goto(server.origin + "/session/custom-imported");
      await page.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed");
      assert.match(await page.locator("#bootstrap-log").textContent(), /missing or changed.*Saved sessions have not been changed/s);
      assert.deepEqual(await store("custom-imported"), imported);
      await page.goto(server.origin + "/session/");
      const missing = page.locator("#sessions li").filter({ hasText: "custom-imported" });
      await missing.getByText(/Custom image missing/).waitFor();
      assert.equal(await missing.locator("a").count(), 0);
      await missing.getByRole("button", { name: "Recover files", exact: true }).click();
      await boot();
      assert.equal(await submit("grep -q CUSTOM-SOURCE-BUILT /workspace/recovered-custom-imported/workspace/project/result"), 0);
      assert.deepEqual(await store("custom-imported"), imported);
      await page.goto(server.origin + "/custom/");
      const recipePath = join(scratch, "Dollyfile");
      await writeFile(recipePath, source);
      await page.locator("#dollyfile-upload").setInputFiles(recipePath);
      await page.waitForFunction((text) => document.querySelector("#source").value === text, source);
      await page.locator("form button[type=submit]").click();
      await page.waitForURL("**/custom/rebuild/");
      await boot();
      await page.goto(server.origin + "/session/custom-imported");
      await boot();
      await check();
      assert.deepEqual(await store("custom-imported"), imported);
      console.log(`${name}: custom build, keyboard save, closed-tab restore, export/import, policy intersection, missing base, recovery and exact rebuild passed in ${((performance.now() - started) / 1e3).toFixed(1)}s`);
    } catch (error) {
      if (page && !page.isClosed()) console.error(await page.locator("#bootstrap-log").textContent().catch(() => ""));
      throw error;
    } finally {
      clearTimeout(timer);
      await browser.close();
    }
  }
} finally {
  await server.close();
  await rm(scratch, { recursive: true, force: true });
}
