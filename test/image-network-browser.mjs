// An image's HTTP rows narrow the page's policy: under an embedding that admits the
// fixtures, the declared request answers, and another path, method or host and a
// declared request the embedding does not admit are refused before they leave. A
// save of the image keeps its declaration where the page admits everything, even
// with the save's own record of what its tab inherited widened.
// Usage: node test/image-network-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest, routeAttributes, workbench } from "./browser.mjs";

// curl's status for a request the page's policy refuses.
const refused = 9;
// A page of CONTEXT at URL, booted to its shell, and the status of a curl there.
async function shell(context, url, setup) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await setup?.(page);
  await page.goto(url);
  // A rebuild route builds its image first: measured at 42 s on a loaded machine.
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null,
    { timeout: 180_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "the shell"));
  return { page, curl: what => page.evaluate(text => __dolly.submit(text), `curl -fsS ${what} > /dev/null`) };
}

await browserTest("image network", { image: "system", timeout: 600_000 }, async ({ browser, server }) => {
  const origin = server.origin, context = await browser.newContext();
  const image = await workbench([], [], { http: [`HTTP GET ${origin}/fixture/http.txt`, `HTTP GET ${origin}/wide/*`] });
  const { page, curl } = await shell(context, `${origin}${image.path}`, async page => {
    await routeAttributes(page, { policy: { rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET", "HEAD", "POST"] }] } });
    await image.setup(page);
  });
  assert.equal(await curl(`${origin}/fixture/http.txt`), 0, "the declared request");
  assert.equal(await curl(`${origin}/fixture/large`), refused, "another path");
  assert.equal(await curl(`-X POST --data x ${origin}/fixture/http.txt`), refused, "another method");
  assert.equal(await curl("https://example.com/"), refused, "another host");
  assert.equal(await curl(`${origin}/wide/x`), refused, "a declared request the embedding does not admit");
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
  await page.close();
  const restored = await shell(context, `${origin}/session/?name=declared-open`);
  assert.equal(await restored.curl(`${origin}/fixture/http.txt`), 0, "the declared request, restored");
  assert.equal(await restored.curl(`${origin}/fixture/large`), refused, "another path, restored");
  assert.equal(await restored.curl("https://example.com/"), refused, "another host, restored");
  assert.equal(server.requests.has("/fixture/large"), false);
  await context.close();
});
