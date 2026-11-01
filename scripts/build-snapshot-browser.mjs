#!/usr/bin/env node
// Builds one image in headless Chrome, streaming its build log to stdout, and
// writes the snapshot to OUTPUT (new, inside dist/) and its dependency inputs
// to OUTPUT.inputs.json. The persistent profile and a port derived from its
// path keep one origin, so completed images are reused from the profile's
// IndexedDB. --unpackaged hides packaged snapshots: every dependency must be
// rebuilt (cold) or come from that cache (warm).
// usage: build-snapshot-browser.mjs IMAGE OUTPUT [--unpackaged cold|warm]
// env: DOLLY_BROWSER_PROFILE (.cache/snapshot-browser-profile)
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { discoverImageDefinitions, selectImageDefinitions } from "./image-definitions.mjs";
import { buildImageInPage, savePageSnapshot } from "./page-image-build.mjs";
import { startCheckoutServer } from "./serve-checkout.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { sitePath } from "../src/static-asset.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const { positionals: [image, outputArgument], values: { unpackaged } } = parseArgs({
  allowPositionals: true, options: { unpackaged: { type: "string" } },
});
const definition = DOLLY_IMAGES.find(candidate => candidate.image === image);
if (!definition || !outputArgument || ![undefined, "cold", "warm"].includes(unpackaged)) {
  throw new Error("usage: build-snapshot-browser.mjs IMAGE OUTPUT [--unpackaged cold|warm]");
}
const output = resolve(outputArgument);
if (!output.startsWith(resolve(projectDir, "dist") + sep)) throw new Error("OUTPUT must be inside dist/");
const profile = resolve(process.env.DOLLY_BROWSER_PROFILE ?? resolve(projectDir, ".cache/snapshot-browser-profile"));
const port = 20_000 + Number.parseInt(createHash("sha256").update(profile).digest("hex").slice(0, 8), 16) % 20_000;
const graph = await createDollyfileGraphLoader(projectDir)(definition.dollyfile);
// Recipes' explicit upstream URLs are the only network the build may use.
const rules = graph.records.flatMap(record => record.sources.filter(source => sitePath(source.location) === null))
  .map(source => ({ origin: new URL(source.location).origin, path: new URL(source.location).pathname, methods: ["GET"] }));

async function handle(request, response, path, headers) {
  if (!unpackaged || !/^\/dist\/(?:packs\/|dolly-.+-system-snapshot\.mjs$)/.test(path)) return false;
  response.writeHead(404, headers).end();
  return true;
}

const server = await startCheckoutServer(projectDir, null, { port, handle });
let context;
try {
  console.log(`dolly: building ${image} in Chrome at ${server.origin} with profile ${profile}`);
  context = await chromium.launchPersistentContext(profile, {
    channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.exposeFunction("dollyBuildLog", text => void process.stdout.write(text));
  await page.addInitScript(rules => { globalThis.DOLLY_HTTP_POLICY = { maxRequests: 256, rules }; }, rules);
  await page.goto(`${server.origin}/__dolly_build_page`);
  const { inputs, dependenciesBuilt } = await page.evaluate(
    `(${buildImageInPage})(location.origin + "/", location.origin + "/", ${JSON.stringify(image)})`);
  const saved = await savePageSnapshot(page, output);
  const dependencies = (await selectImageDefinitions(await discoverImageDefinitions(projectDir), image)).length - 1;
  if (unpackaged && dependenciesBuilt !== (unpackaged === "cold" ? dependencies : 0)) {
    throw new Error(`${image} did not exercise the ${unpackaged} image cache`);
  }
  await writeFile(`${output}.inputs.json`, JSON.stringify(inputs), { flag: "wx" });
  console.log(`dolly: exported ${saved} byte ${image} snapshot`);
} finally {
  await context?.close();
  await server.close();
}
