import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";
import { createHttpRedirectFixture } from "./fixtures/http-redirect-server.mjs";

// One source served the way the Pages export delivers oversized static assets:
// a manifest (x-dolly-parts: 1) plus fixed sibling .part-N files.
const source = "/static/default/commands/curl.c";
const bytes = await readFile(new URL(`../dist${source}`, import.meta.url));
const half = Math.ceil(bytes.length / 2), parts = [bytes.subarray(0, half), bytes.subarray(half)];
const sha256 = value => createHash("sha256").update(value).digest("hex");
const manifest = JSON.stringify({ byteLength: bytes.length, sha256: sha256(bytes),
  parts: parts.map(part => ({ byteLength: part.length, sha256: sha256(part) })) });
const partRequests = [];
let corrupt = false;
const redirects = createHttpRedirectFixture();
async function handle(request, response, path, headers) {
  if (await redirects(request, response, new URL(request.url, "http://127.0.0.1"))) return true;
  if (path === source) {
    response.writeHead(200, { ...headers, "content-type": "application/octet-stream", "x-dolly-parts": "1" });
    response.end(manifest);
    return true;
  }
  const part = /^\/static\/default\/commands\/curl\.c\.part-([01])$/.exec(path);
  if (!part) return false;
  partRequests.push(path);
  response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
  response.end(corrupt ? "corrupt" : parts[part[1]]);
  return true;
}

await browserTest("boundary", { server: { handle } }, async ({ server, open }) => {
  const { page, submit } = await open({ policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  // Outer imports equal the contract, plugin ABI rejections, policy before
  // Fetch, deadlines, quotas, typed errors, literal metadata and redirects.
  await page.evaluate(() => import("/test/fixtures/browser-boundary.mjs")
    .then(module => module.runBrowserBoundaryChecks(new URL("/", location.href).href)));
  partRequests.length = 0;
  corrupt = false;
  // Recipes name the canonical URL; the page fetches its own copy.
  const canonical = `https://daugasauron.com${source}`;
  assert.equal(await submit(`curl -fsS ${canonical} -o /tmp/boundary-source.c`), 0);
  assert.equal(await submit(`test "$(sha256sum /tmp/boundary-source.c | cut -d ' ' -f 1)" = ${sha256(bytes)}`), 0);
  assert.equal(partRequests.length, 2, "one authorized source fetch reads its two fixed parts");
  assert.notEqual(await submit(`curl -fsS ${canonical}.part-0 -o /tmp/boundary-denied`), 0);
  assert.notEqual(await submit(`curl -fsS ${server.origin}${source} -o /tmp/boundary-denied`), 0);
  assert.equal(partRequests.length, 2, "derived delivery grants no guest access to sibling or mirror URLs");
  corrupt = true;
  assert.notEqual(await submit(`curl -fsS ${canonical} -o /tmp/boundary-corrupt`), 0);
  assert.equal(await submit("rm -f /tmp/boundary-source.c /tmp/boundary-corrupt"), 0);
});
