import assert from "node:assert/strict";
import { sha256 } from "../scripts/sha256.mjs";
import { readFile } from "node:fs/promises";
import { browserTest, composed, workbench } from "./browser.mjs";
import { createHttpRedirectFixture } from "./fixtures/http-redirect-server.mjs";
import { siteReference } from "../page/static-asset.mjs";

// One source served the way the Pages export delivers oversized static assets:
// a manifest, known by its content, plus fixed sibling .part-N files.
const source = "/dist/static/default/commands/curl.c";
const bytes = await readFile(new URL(`..${source}`, import.meta.url));
const half = Math.ceil(bytes.length / 2), parts = [bytes.subarray(0, half), bytes.subarray(half)];
const manifest = JSON.stringify({ byteLength: bytes.length, sha256: sha256(bytes),
  parts: parts.map(part => ({ byteLength: part.length, sha256: sha256(part) })) });
const partRequests = [];
let corrupt = false;
const redirects = createHttpRedirectFixture();
async function handle(request, response, path, headers) {
  if (await redirects(request, response, new URL(request.url, "http://127.0.0.1"))) return true;
  if (path === source) {
    response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
    response.end(manifest);
    return true;
  }
  const part = /^\/dist\/static\/default\/commands\/curl\.c\.part-([01])$/.exec(path);
  if (!part) return false;
  partRequests.push(path);
  response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
  response.end(corrupt ? "corrupt" : parts[part[1]]);
  return true;
}

// The sizes of the shared buffers of 64 MiB or more (the kernel's smallest
// memory, and a Wasm memory's buffer is one) in the page's heap: a heap
// snapshot with V8's internals names each buffer's backing store and its size.
async function largeSharedBuffersInHeap(page) {
  const devtools = await page.context().newCDPSession(page);
  let chunks = "";
  devtools.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => { chunks += chunk; });
  await devtools.send("HeapProfiler.takeHeapSnapshot", { exposeInternals: true });
  await devtools.detach();
  const { snapshot: { meta }, nodes, edges, strings } = JSON.parse(chunks);
  const field = name => meta.node_fields.indexOf(name), nodeWidth = meta.node_fields.length, edgeWidth = meta.edge_fields.length;
  const sizes = [];
  for (let node = 0, edge = 0; node < nodes.length; node += nodeWidth) {
    const end = edge + nodes[node + field("edge_count")] * edgeWidth;
    if (strings[nodes[node + field("name")]] === "SharedArrayBuffer") {
      for (; edge < end; edge += edgeWidth) {
        const target = edges[edge + meta.edge_fields.indexOf("to_node")], size = nodes[target + field("self_size")];
        if (strings[edges[edge + meta.edge_fields.indexOf("name_or_index")]] === "backing_store" && size >= 64 * 1024 * 1024) {
          sizes.push(size);
        }
      }
    }
    edge = end;
  }
  return sizes;
}

await browserTest("boundary", { image: "system", server: { handle } }, async ({ name, server, open }) => {
  const { page, submit } = await open({ ...await workbench(), policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  // Outer imports equal the contract, plugin ABI rejections, policy before
  // Fetch, deadlines, quotas, typed errors, literal metadata and redirects.
  await page.evaluate(() => import("/test/fixtures/browser-boundary.mjs")
    .then(module => module.runBrowserBoundaryChecks(new URL("/", location.href).href)));
  partRequests.length = 0;
  corrupt = false;
  // Recipes name the site path: a build's SOURCE row reads the page's own copy,
  // its two fixed parts checked against the manifest, and the engine checks the pin.
  const reference = siteReference(source.slice(1));
  const sourced = () => composed(["runtime", "display", "input"], ["core", "posix", "display"],
    { rows: [`SOURCE ${reference} ${sha256(bytes)} /usr/share/boundary-source.c`, "FILE /usr/share/boundary-source.c"] });
  const built = await open(await sourced());
  assert.equal(await built.submit(`test "$(sha256sum /usr/share/boundary-source.c | cut -d ' ' -f 1)" = ${sha256(bytes)}`), 0);
  await built.page.close();
  assert.equal(partRequests.length, 2, "one build input reads its two fixed parts");
  // A program's request for the file or a part is the policy's to judge, and
  // this one has no rule for them: the site grants nothing.
  for (const target of [reference, `${reference}.part-0`, `${server.origin}${source}.part-0`, `/v987.0.21${source}`])
    assert.notEqual(await submit(`curl -fsS ${target} -o /tmp/boundary-denied`), 0, target);
  assert.equal(partRequests.length, 2, "a program reached a file of the site");
  corrupt = true;
  await assert.rejects(open({ prompt: null, ...await sourced() }), /SOURCE [^\n]*\(line \d+\): [\s\S]*SOURCE failed/);
  // The page holds no view of kernel memory, only Workers do: after typing,
  // HTTP and the display, the page's heap has no shared buffer of its size.
  // In Chromium, whose DevTools protocol lists them.
  if (name === "chromium") assert.deepEqual(await largeSharedBuffersInHeap(page), [], "the page holds a view of kernel memory");

  // An uncaught failure in the runtime Worker, as a kernel trap outside a
  // system call would be, ends the runtime: the page must not stay "ready".
  // A rebuild route's runtime Worker is the build's (site/site.mjs).
  await page.workers().find(worker => /\/(?:dist\/dolly-runtime-worker|site\/build-worker)\.mjs$/.test(worker.url()))
    .evaluate(() => { setTimeout(() => { throw new Error("boundary probe"); }); });
  await page.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed");
  assert.match(await page.locator("#bootstrap-log").textContent(), /FATAL\n.*boundary probe/);
});
