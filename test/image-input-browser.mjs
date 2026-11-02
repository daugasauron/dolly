import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { buildTwice } from "./fixtures/image-build-browser.mjs";
import { largePublishedInput, LARGE_INPUT_BYTES, LARGE_INPUT_PATH } from "./fixtures/large-published-input.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { siteReference } from "../src/static-asset.mjs";
import { DOLLY_SYSTEM_SNAPSHOT as systemMetadata } from "../dist/dolly-system-system-snapshot.mjs";

// A build whose input is a published image over 512 MB, as fd's is the 527 MB
// rust-build: the page reads it from its packs and hands it to the build
// Worker, which copies a file of it into the image, itself over 512 MB; a
// second build reads both from the image cache. Built first thing after the
// browser starts, as the catalog's build page does.
const [system, core] = ["system", "core"].map(name => DOLLY_IMAGES.find(({ image }) => image === name));
const large = await largePublishedInput("core");
const recipe = `DOLLY 7
APPLICATION large-input
${system.hostRequirements.map(module => `REQUIRES HOST ${module}\n`).join("")}FROM ${siteReference(system.dollyfile)} ${system.sha256}
COPY ${siteReference(core.dollyfile)} ${core.sha256} ${LARGE_INPUT_PATH} ${LARGE_INPUT_PATH}
ENTRY /bin/slop
`;
function handle(request, response, path, headers) {
  const served = large.files.get(path);
  if (!served) return false;
  response.writeHead(200, { ...headers, "content-type": served.type }).end(served.body);
  return true;
}

await browserTest("image input", { image: "system", server: { handle }, timeout: 600_000 }, async ({ browser, server }) => {
  const page = await browser.newPage();
  page.setDefaultTimeout(600_000);
  await page.goto(`${server.origin}/__dolly_build_page`);
  const [first, second] = await page.evaluate(buildTwice, recipe);
  assert.deepEqual(first.inputs, [systemMetadata.byteLength, large.byteLength].sort((left, right) => left - right));
  assert.ok(first.byteLength > LARGE_INPUT_BYTES && first.intact, "the built image holds the copied file");
  assert.ok(first.packsFetched > 0);
  assert.deepEqual(second, { ...first, packsFetched: 0 }, "the second build reads its inputs from the image cache");
  await page.close();
});
