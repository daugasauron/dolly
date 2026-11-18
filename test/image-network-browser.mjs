// An image's HTTP rows narrow the page's policy: under an embedding that admits the
// fixtures, the declared request answers, and another path, method or host and a
// declared request the embedding does not admit are refused before they leave. A
// save of the image keeps its declaration where the page admits everything, even
// with the save's own record of what its tab inherited widened.
// Usage: node test/image-network-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest, workbench } from "./browser.mjs";

// curl's status for a request the page's policy refuses.
const refused = 9;
await browserTest("image network", { image: "system", timeout: 600_000 }, async ({ server, open }) => {
  const origin = server.origin;
  const { page, submit } = await open({ policy: { rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET", "HEAD", "POST"] }] },
    ...await workbench([], [], { http: [`HTTP GET ${origin}/fixture/http.txt`, `HTTP GET ${origin}/wide/*`] }) });
  const status = command => submit(`curl -fsS ${command} > /dev/null`);
  assert.equal(await status(`${origin}/fixture/http.txt`), 0, "the declared request");
  assert.equal(await status(`${origin}/fixture/large`), refused, "another path");
  assert.equal(await status(`-X POST --data x ${origin}/fixture/http.txt`), refused, "another method");
  assert.equal(await status("https://example.com/"), refused, "another host");
  assert.equal(await status(`${origin}/wide/x`), refused, "a declared request the embedding does not admit");
  for (const path of ["/fixture/large", "/wide/x"]) assert.equal(server.requests.has(path), false, path);

  // The save, its record made to say its tab inherited no policy: opened where the page
  // admits everything, the recipe's rows still hold.
  assert.equal(await page.evaluate(() => __dolly.saveSession("declared")), "declared");
  await page.evaluate(async () => {
    const store = await import("/host/snapshot/session-store.mjs");
    const record = await store.loadStoredSession("declared");
    record.name = "declared-open";
    record.customImage.policies = [null];
    await store.saveStoredSession(record);
  });
  // A page of the same context: closing the first page closes its context.
  const restored = await page.context().newPage();
  await page.close();
  await restored.goto(`${origin}/session/?name=declared-open`);
  await restored.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null,
    { timeout: 120_000 });
  assert.equal(await restored.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await restored.locator("#bootstrap-log").textContent());
  await restored.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "the restored shell"));
  const restoredStatus = command => restored.evaluate(text => __dolly.submit(text), `curl -fsS ${command} > /dev/null`);
  assert.equal(await restoredStatus(`${origin}/fixture/http.txt`), 0, "the declared request, restored");
  assert.equal(await restoredStatus(`${origin}/fixture/large`), refused, "another path, restored");
  assert.equal(await restoredStatus("https://example.com/"), refused, "another host, restored");
  assert.equal(server.requests.has("/fixture/large"), false);
  await restored.close();
});
