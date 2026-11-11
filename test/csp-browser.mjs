// A page under the strict Content-Security-Policy docs/embedding.md gives an embedding, with no
// 'unsafe-inline' or 'unsafe-eval', on every response: system with html boots, an html@0
// popup takes a form's fields, download@0 offers a file and upload@0's dialog opens, and the
// browser reports no violation of the policy.
// Usage: node test/csp-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; " +
  "img-src 'self' blob:; object-src 'none'; base-uri 'none'";

await browserTest("csp", { image: "system", timeout: 300_000, server: { responseHeaders: { "content-security-policy": policy } } },
  async ({ open }) => {
    const violations = [];
    const image = await composed(["html"], ["html"], { base: "system" });
    const { page, submit } = await open({ ...image, async setup(page) {
      // Workers report theirs to the console alone.
      page.on("console", message => { if (/Content.Security.Policy/i.test(message.text())) violations.push(message.text()); });
      await page.addInitScript(() => document.addEventListener("securitypolicyviolation", event =>
        console.error(`Content-Security-Policy: ${event.effectiveDirective} refused ${event.blockedURI}`)));
      await image.setup(page);
    } });
    const answered = submit("echo '<p>Hello</p><form><input name=answer><button>Send</button></form>' | html > /tmp/answer");
    answered.catch(() => {}); // A failing test closes the page under it.
    const frame = page.frameLocator("#html-popup iframe");
    await frame.locator("input").fill("forty two");
    await frame.getByRole("button", { name: "Send" }).click();
    assert.equal(await answered, 0);
    assert.equal(await submit("test \"$(cat /tmp/answer)\" = answer=forty+two"), 0);
    assert.equal(await submit("download /tmp/answer"), 0);
    await page.locator("#downloads button", { hasText: "Save answer" }).waitFor();
    const uploading = submit("upload /tmp/uploaded");
    uploading.catch(() => {});
    await page.locator("#file-upload[open]").waitFor();
    await page.locator("#file-upload button", { hasText: "Cancel" }).click();
    assert.equal(await uploading, 1);
    assert.deepEqual(violations, []);
  });
