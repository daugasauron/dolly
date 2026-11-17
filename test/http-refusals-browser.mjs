// Each request the HTTP policy refuses is a line in the console and a notice on the page,
// without the URL's query, until the user closes it: one notice and a count for refusals of
// one method and URL, the five newest with a line for the rest, × and Close all.
// Usage: node test/http-refusals-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

await browserTest("http refusals", { image: "system" }, async ({ server, open }) => {
  const warnings = [];
  const { page, submit } = await open({ policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: page => page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); }) });
  const notices = page.locator("#http-refusals li:not(.rest)");
  const texts = () => notices.locator("span").allInnerTexts();
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/http.txt > /dev/null`), 0);
  assert.equal(await page.locator("#http-refusals").isHidden(), true);
  for (let time = 0; time < 2; time++) assert.notEqual(await submit("curl -fsS 'https://example.com/private?key=secret'"), 0);
  assert.deepEqual(await texts(), ["The HTTP policy refused GET https://example.com/private (2 times)"]);
  assert.deepEqual(warnings.filter(text => text.includes("example.com/private")),
    Array(2).fill("Dolly HTTP policy denied the request: GET https://example.com/private"));
  assert.equal(warnings.some(text => text.includes("secret")), false);
  for (const path of ["a", "b", "c", "d", "e", "f"]) assert.notEqual(await submit(`curl -fsS https://example.com/${path}`), 0);
  assert.deepEqual(await texts(), ["f", "e", "d", "c", "b"].map(path => `The HTTP policy refused GET https://example.com/${path}`));
  assert.match(await page.locator("#http-refusals li.rest").innerText(), /2 more refused/);
  await notices.first().getByRole("button").click();
  assert.deepEqual(await texts(), ["e", "d", "c", "b", "a"].map(path => `The HTTP policy refused GET https://example.com/${path}`));
  await page.getByRole("button", { name: "Close all refusals" }).click();
  assert.equal(await page.locator("#http-refusals").isHidden(), true);
  assert.equal(await submit("true"), 0, "the terminal has the keyboard again");
});
