#!/usr/bin/env node
// Builds one image in headless Chrome, streaming its build log to stdout, and
// writes the snapshot to OUTPUT (new, inside dist/) and its dependency inputs
// to OUTPUT.inputs.json. The persistent profile and a port derived from its
// path keep one origin, so completed images are reused from the profile's
// IndexedDB. --unpackaged hides packaged snapshots: dependencies must be rebuilt
// (cold) or come from that cache (warm).
// usage: build-snapshot-browser.mjs IMAGE OUTPUT [--unpackaged cold|warm]
// env: DOLLY_BROWSER_PROFILE (.cache/snapshot-browser-profile), DOLLY_BROWSER_PORT
import { createHash } from "node:crypto";
import { open, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { startBrowserServer } from "../test/browser-server.mjs";
import { MAX_SNAPSHOT_BYTES } from "../src/snapshot-records.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { canonicalPath } from "../src/static-asset.mjs";

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
const port = Number(process.env.DOLLY_BROWSER_PORT ??
  20_000 + Number.parseInt(createHash("sha256").update(profile).digest("hex").slice(0, 8), 16) % 20_000);
const graph = await createDollyfileGraphLoader(projectDir)(definition.dollyfile);
// Recipes' explicit upstream URLs are the only network the build may use.
const rules = graph.records.flatMap(record => record.sources.filter(source => canonicalPath(source.location) === null))
  .map(source => ({ origin: new URL(source.location).origin, path: new URL(source.location).pathname, methods: ["GET"] }));

let uploaded = 0, file;
async function handle(request, response, path, headers) {
  if (path === "/__dolly_build_page") {
    response.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Dolly image build</title>");
  } else if (unpackaged && /^\/dist\/(?:packs\/|dolly-.+-system(?:\.snapshot|-snapshot\.mjs)$)/.test(path)) {
    response.writeHead(404, headers).end();
  } else if (path === "/__dolly_build_snapshot" && request.method === "POST") {
    // The page sends the snapshot in order, in chunks small enough for Chrome's blob storage.
    const query = new URL(request.url, "http://upload").searchParams;
    const offset = Number(query.get("offset")), length = Number(query.get("length"));
    try {
      if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_SNAPSHOT_BYTES) throw new Error("invalid snapshot size");
      if (offset !== uploaded) throw new Error("snapshot chunk out of order");
      if (offset === 0) file = await open(output, "wx");
      for await (const chunk of request) {
        if (uploaded + chunk.length > length) throw new Error("snapshot exceeds its declared size");
        await file.write(chunk, 0, chunk.length, uploaded);
        uploaded += chunk.length;
      }
      if (uploaded === length) await file.close();
      response.writeHead(204, headers).end();
    } catch (error) {
      await file?.close().catch(() => {});
      await rm(output, { force: true });
      response.writeHead(500, headers).end(error.message);
    }
  } else return false;
  return true;
}

// Runs in the page: build the image's missing dependencies, then the image.
async function buildInPage(image) {
  const log = text => void globalThis.dollyBuildLog(text);
  const [registry, policy, transport, builder, graph] = await Promise.all([
    "/dist/dolly-images.mjs", "/host/http/policy.mjs", "/host/build/local-services.mjs",
    "/src/image-builder.mjs", "/src/image-build.mjs",
  ].map(path => import(new URL(path, location.href))));
  const sources = [
    ...registry.DOLLY_IMAGES.map(definition => ({ path: `/${definition.dollyfile}`, byteLength: definition.byteLength })),
    ...registry.DOLLY_STATIC_SOURCES,
  ];
  const network = transport.localServicesTransport(
    policy.consumeDollyHttpPolicy(globalThis, sources, new URL("/", location.href)));
  const build = (name, artifacts) => builder.buildImage(name, artifacts, network, log);
  const { bytes, inputs } = await build(image,
    await graph.prepareImageArtifacts(image, undefined, build, text => log(`${text}\n`)));
  const snapshot = new Uint8Array(bytes), chunk = 64 * 1024 * 1024;
  for (let offset = 0; offset < snapshot.length; offset += chunk) {
    const response = await fetch(`/__dolly_build_snapshot?offset=${offset}&length=${snapshot.length}`,
      { method: "POST", body: snapshot.subarray(offset, offset + chunk) });
    if (response.status !== 204) throw new Error(`snapshot upload failed: ${await response.text()}`);
  }
  return inputs;
}

const server = await startBrowserServer(projectDir, null, { port, handle });
let context;
try {
  console.log(`dolly: building ${image} in Chrome at ${server.origin} with profile ${profile}`);
  context = await chromium.launchPersistentContext(profile, {
    channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = context.pages()[0] ?? await context.newPage();
  let reused = false;
  await page.exposeFunction("dollyBuildLog", text => {
    reused ||= text.includes("reusing local ");
    process.stdout.write(text);
  });
  await page.addInitScript(rules => { globalThis.DOLLY_HTTP_POLICY = { maxRequests: 256, rules }; }, rules);
  await page.goto(`${server.origin}/__dolly_build_page`);
  const inputs = await page.evaluate(buildInPage, image);
  if (unpackaged && reused !== (graph.artifacts.length !== 0 && unpackaged === "warm")) {
    throw new Error(`${image} did not exercise the ${unpackaged} image cache`);
  }
  await writeFile(`${output}.inputs.json`, JSON.stringify(inputs), { flag: "wx" });
  console.log(`dolly: exported ${uploaded} byte ${image} snapshot`);
} finally {
  await context?.close();
  await server.close();
}
