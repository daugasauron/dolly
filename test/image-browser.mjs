import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { dollyfileCases } from "./fixtures/dollyfile-cases.mjs";
import { buildBufferReuse, buildLogProof } from "./fixtures/image-build-browser.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { siteReference } from "../src/static-asset.mjs";
import { DOLLY_SYSTEM_SNAPSHOT as systemMetadata } from "../dist/dolly-system-system-snapshot.mjs";
import { DOLLY_SYSTEM_SNAPSHOT as toolsMetadata } from "../dist/dolly-system-tools-system-snapshot.mjs";

// system is built FROM system-tools: the base and child of the cache checks.
const [system, tools] = ["system", "system-tools"].map(name => DOLLY_IMAGES.find(({ image }) => image === name));
const packs = metadata => metadata.packs.map(({ sha256 }) => `/dist/packs/${sha256}.snapshot.gz`).sort();
const systemPacks = packs(systemMetadata), toolsPacks = packs(toolsMetadata);
const sources = { "fs-record.h": "src/fs-record.h", "fs-record.c": "test/fixtures/fs-record.c",
  "image-roundtrip.c": "test/fixtures/image-roundtrip.c", "system-snapshot.c": "src/system-snapshot.c",
  "system-snapshot.h": "src/system-snapshot.h", "dollyfile.c": "src/dollyfile.c", "sha256.h": "src/sha256.h" };
const fixtures = { ...sources, "parser-dollyfile.c": "src/dollyfile.c", "parser-fs-record.h": "src/fs-record.h",
  "parser-sha256.h": "src/sha256.h" };
let hideSystemMetadata = false;
let parserRecipes = new Map();
function handle(request, response, path, headers) {
  if (hideSystemMetadata && path === "/dist/dolly-system-system-snapshot.mjs") response.writeHead(404, headers).end();
  else if (parserRecipes.has(path)) response.writeHead(200, { ...headers, "content-type": "text/plain" }).end(parserRecipes.get(path));
  else return false;
  return true;
}

// A derived image built in the tab from a published base: shell, exports,
// deletions, and an ENTRY argument that must keep its U+FEFF.
const iterationRecipe = (base, marker) => `DOLLY 7
APPLICATION iteration
REQUIRES HOST runtime@0
REQUIRES HOST display@0
REQUIRES HOST download@0
REQUIRES HOST http@0
REQUIRES HOST snapshot@0
REQUIRES HOST upload@0
FROM ${siteReference(base.dollyfile)} ${base.sha256}
SLOP mkdir -p /opt/iteration/bin; cp /bin/echo /opt/iteration/bin/echo
EXPORTS ENV PATH /opt/iteration/bin:/bin:/usr/bin
EXPORTS TOOL echo
FILE /usr/share/iteration-deleted
    old
SLOP rm /usr/share/iteration-deleted
FILE /tmp/iteration.c
    #include <stdio.h>
    int main(void) { puts("${marker}"); return 0; }
SLOP cc /tmp/iteration.c -o /usr/bin/iteration
EXPORTS TOOL iteration
EXPORTS ENV DOLLY_ITERATION first
EXPORTS ENV DOLLY_ITERATION APPEND second
FILE /usr/share/iteration-entry.slop
    test "$1" = '\uFEFFargument' || exit 87
    /bin/foreground -i /bin/slop
EXPORTS FILE iteration-entry /usr/share/iteration-entry.slop
ENTRY /bin/slop /usr/share/iteration-entry.slop '\uFEFFargument'
`;

// Records image-cache payload reads, which only happen in the page.
function instrument(source) {
  if (!sessionStorage.getItem("dolly-custom-source")) sessionStorage.setItem("dolly-custom-source", source);
  globalThis.artifactReads = [];
  performance.setResourceTimingBufferSize(4000);
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (key) {
    const request = get.call(this, key), store = this.name;
    request.addEventListener("success", () => {
      const value = request.result;
      artifactReads.push({ store, key, bytes: value instanceof Blob ? value.size
        : (value instanceof ArrayBuffer ? value : value?.bytes)?.byteLength ?? 0 });
    });
    return request;
  };
}

await browserTest("image", { image: "system", server: { fixtures, handle }, timeout: 600_000 }, async ({ browser, server, open }) => {
  const parser = dollyfileCases(server.origin);
  parserRecipes = parser.recipes;
  const { page: shell, submit } = await open({ policy: { rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
    ...[...parserRecipes.keys()].filter(path => path.startsWith("/modules/"))
      .map(path => ({ origin: server.origin, path, methods: ["GET"] })),
  ] } });
  // The rebuild screen's log and the in-page builder's reuse of its inputs.
  assert.equal(await shell.evaluate(buildLogProof), true);
  assert.match(await shell.evaluate(buildBufferReuse), /^[0-9a-f]{64}$/);
  assert.equal(await shell.evaluate(async () => {
    const memory = new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: "i64" });
    const { instance } = await WebAssembly.instantiateStreaming(fetch("/dist/dolly-image-0.wasm"), { env: { memory } });
    return instance.exports.dolly_snapshot_format_version();
  }), 2, "snapshot contract version");
  const run = async command => assert.equal(await submit(command), 0, command);
  // The image codec against the shared Wasm filesystem keeps every path kind.
  await run("mkdir /tmp/retention && cd /tmp/retention");
  for (const name of Object.keys(sources)) await run(`curl -fsS ${server.origin}/fixture/${name} -o ${name}`);
  for (const [name, source] of [["records", "fs-record.c"], ["system", "image-roundtrip.c"]]) {
    await run(`cc -O0 -I. ${source} -o ${name} && ./${name} /tmp/retention`);
  }
  // Sealing fails when ENTRY names an executable the image does not retain.
  await run("cc -O0 dollyfile.c -o dollyfile && printf 'DOLLY 7\\nAPPLICATION entry-missing\\nENTRY /bin/slop\\n' > Dollyfile");
  assert.equal(await submit("./dollyfile FILE:/tmp/retention/Dollyfile 2> error"), 1);
  await run("grep -q 'ENTRY needs /bin/slop' error && cp dollyfile /tmp/dollyfile && cd / && rm -rf /tmp/retention");
  await parser.run(submit);
  // A receipt lists an export's members in path order, whatever order created them.
  await run("printf 'DOLLY 7\\nPACKAGE order\\nEXPORTS FOLDER order /usr/share/order\\n' > /tmp/Dollyfile-order");
  for (const [index, create] of ["touch c a-b && mkdir a && touch a/b", "mkdir a && touch a/b a-b c"].entries()) {
    await run(`rm -rf /usr/share/order && mkdir /usr/share/order && cd /usr/share/order && ${create} && cd /`);
    await run(`/tmp/dollyfile FILE:/tmp/Dollyfile-order > /dev/null && cp /etc/dolly/artifact /tmp/receipt-${index}`);
  }
  await run("cmp /tmp/receipt-0 /tmp/receipt-1");
  await shell.close();

  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  await page.addInitScript(instrument, iterationRecipe(system, "iteration-one"));
  const boot = async (target, marker, ownSources = "/none/") => {
    server.requests.clear();
    await target.goto(`${server.origin}/custom/rebuild/`);
    await target.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
    assert.equal(await target.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
      await target.locator("#bootstrap-log").textContent());
    await target.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "iteration shell"));
    assert.equal(await target.evaluate(command => __dolly.submit(command), `test "$(iteration)" = ${marker} && ` +
      'test "$DOLLY_ITERATION" = first:second && test ! -e /usr/share/iteration-deleted && test "$(which echo)" = /opt/iteration/bin/echo'), 0);
    assert.deepEqual([...server.requests.keys()].filter(path =>
      (path.startsWith("/dist/static/") && !path.startsWith(ownSources)) || path === "/dist/dolly.data"), [],
      "a derived build fetched build sources or the compiler seed");
    return target.evaluate(async () => ({
      digest: [...new Uint8Array(await crypto.subtle.digest("SHA-256", __dolly.systemSnapshot))]
        .map(byte => byte.toString(16).padStart(2, "0")).join(""),
      payloadReads: artifactReads.filter(read => read.bytes > 0).map(({ store, key }) => ({ store, key })),
      downloads: performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname)
        .filter(path => /\/dist\/packs\/|\.snapshot$/.test(path)).sort(),
    }));
  };
  // A fresh tab reads the published base's packs only; a second build reads its
  // cached payload only and is byte-identical; an edited command changes the image.
  const published = await boot(page, "iteration-one");
  assert.deepEqual([published.payloadReads, published.downloads], [[], systemPacks]);
  const cached = await boot(page, "iteration-one");
  assert.deepEqual([cached.payloadReads, cached.downloads],
    [[{ store: "payloads", key: `${systemMetadata.buildId}:${system.sha256}` }], []]);
  assert.equal(cached.digest, published.digest);
  await page.evaluate(source => sessionStorage.setItem("dolly-custom-source", source), iterationRecipe(system, "iteration-two"));
  assert.notEqual((await boot(page, "iteration-two")).digest, published.digest);

  // Changing base bytes without changing its recipe invalidates cached and published children.
  assert.deepEqual(await page.evaluate(async ({ system, child }) => {
    const { loadImageArtifactDescriptor, loadImageArtifact, describeImageArtifact, saveImageArtifact,
      loadPackagedSnapshotMetadata, loadPackagedSystemSnapshot } = await import("/src/image-artifact.mjs");
    const { decodeSnapshotRecords, encodeSnapshotRecords } = await import("/src/snapshot-records.mjs");
    const { prepareImageArtifacts } = await import("/src/image-build.mjs");
    const { siteReference } = await import("/src/static-asset.mjs");
    const prime = async definition => {
      const metadata = await loadPackagedSnapshotMetadata(definition.image);
      const artifact = await describeImageArtifact(await loadPackagedSystemSnapshot(definition.image, metadata),
        definition.sha256, metadata.inputs);
      if (!await saveImageArtifact(artifact, `/${definition.dollyfile}`)) throw new Error("cache priming failed");
      return artifact;
    };
    const original = await prime(system);
    await prime(child);
    const records = decodeSnapshotRecords(original.bytes);
    const gitconfig = records.get("/etc/gitconfig");
    records.set("/etc/gitconfig", { kind: 2, data: new TextEncoder().encode(
      new TextDecoder().decode(gitconfig.data) + "\n# changed base output\n") });
    const changed = await describeImageArtifact(encodeSnapshotRecords(records).buffer, system.sha256, original.inputs);
    try {
      if (!await saveImageArtifact(changed, `/${system.dollyfile}`)) throw new Error("cache write failed");
      const staleHit = await loadImageArtifactDescriptor(child.sha256, [{ recipeSha256: system.sha256, sha256: changed.sha256 }]);
      let requested, failure;
      try {
        await prepareImageArtifacts("custom", `DOLLY 7\nAPPLICATION grandchild\nFROM ${siteReference(child.dollyfile)} ${child.sha256}\nENTRY /bin/slop\n`,
          async image => { requested = image; throw new Error("EXPECTED_REBUILD"); }, () => {});
      } catch (error) { failure = error.message; }
      return { changedBytes: changed.sha256 !== original.sha256, staleHit: !!staleHit, requested, failure };
    } finally {
      if (!await saveImageArtifact(original, `/${system.dollyfile}`)) throw new Error("cache restoration failed");
    }
  }, { system: tools, child: system }), { changedBytes: true, staleHit: false, requested: "system", failure: "EXPECTED_REBUILD" });

  // IndexedDB rollback under an injected quota failure, stale and corrupt
  // payload rejection, atomic concurrent publication, recovery of the exact
  // published base, and a schema upgrade that keeps named sessions.
  assert.deepEqual(await page.evaluate(async system => {
    const { loadImageArtifactDescriptor, loadImageArtifact, describeImageArtifact, saveImageArtifact, sha256 } =
      await import("/src/image-artifact.mjs");
    const { encodeSnapshotRecords } = await import("/src/snapshot-records.mjs");
    const { prepareImageArtifacts } = await import("/src/image-build.mjs");
    const { siteReference } = await import("/src/static-asset.mjs");
    const { saveStoredSession, loadStoredSession } = await import("/src/session-store.mjs");
    const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import("/dist/dolly-system-system-snapshot.mjs");
    const make = async (name, value) => {
      const source = new TextEncoder().encode(`DOLLY 7\nAPPLICATION ${name}\nENTRY /bin/slop\n`);
      return describeImageArtifact(encodeSnapshotRecords(new Map([
        ["/etc/dolly/Dollyfile", { kind: 2, data: source }],
        ["/etc/dolly/artifact", { kind: 2, data: new TextEncoder().encode(value) }],
      ])).buffer, await sha256(source));
    };
    const first = await make("cache-proof", "first"), second = await make("cache-proof", "other"), slot = "/cache-proof";
    if (!await saveImageArtifact(first, slot)) throw new Error("initial cache write failed");
    const original = await loadImageArtifactDescriptor(first.recipeSha256);
    const put = IDBObjectStore.prototype.put;
    let rejected;
    try {
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "images" && value.slot === slot) throw new DOMException("injected quota failure", "QuotaExceededError");
        return put.call(this, value, key);
      };
      rejected = !await saveImageArtifact(second, slot);
    } finally { IDBObjectStore.prototype.put = put; }
    const afterFailure = await loadImageArtifact(await loadImageArtifactDescriptor(first.recipeSha256));
    if (!await saveImageArtifact(second, slot)) throw new Error("replacement cache write failed");
    const staleRejected = await loadImageArtifact(original) === null;
    const replacement = await loadImageArtifactDescriptor(second.recipeSha256);
    if (!await saveImageArtifact({ ...second, bytes: first.bytes }, slot)) throw new Error("corrupt fixture write failed");
    const corruptionRejected = await loadImageArtifact(replacement) === null;
    const next = await make("cache-next", "next");
    if (!await saveImageArtifact(next, slot)) throw new Error("new recipe write failed");
    const oldDescriptorGone = await loadImageArtifactDescriptor(first.recipeSha256) === null;
    const before = artifactReads.length;
    await loadImageArtifact(original);
    const oldPayloadGone = artifactReads.slice(before).some(read => read.store === "payloads" && read.bytes === 0);
    const writes = await Promise.all([saveImageArtifact(first, slot), saveImageArtifact(next, slot)]);
    const survivors = (await Promise.all([loadImageArtifactDescriptor(first.recipeSha256),
      loadImageArtifactDescriptor(next.recipeSha256)])).filter(Boolean);
    const concurrent = writes.every(Boolean) && survivors.length === 1 &&
      (await loadImageArtifact(survivors[0]))?.sha256 === survivors[0].sha256;
    const base = await loadImageArtifact(await loadImageArtifactDescriptor(system.sha256, metadata.inputs));
    let recovered;
    try {
      if (!await saveImageArtifact({ ...base, bytes: new ArrayBuffer(1), byteLength: 1 }, `/${system.dollyfile}`)) {
        throw new Error("corrupt base write failed");
      }
      const [artifact] = await prepareImageArtifacts("custom",
        `DOLLY 7\nAPPLICATION cache-consumer\nFROM ${siteReference(system.dollyfile)} ${system.sha256}\nENTRY /bin/slop\n`,
        async () => { throw new Error("corruption must recover the exact published bytes, not rebuild"); }, () => {});
      recovered = artifact.sha256 === base.sha256 && artifact.bytes.byteLength === base.bytes.byteLength;
    } finally { await saveImageArtifact(base, `/${system.dollyfile}`); }
    await saveStoredSession({ name: "cache-migration-proof", formatVersion: 2, buildId: first.buildId,
      image: "system", imageIdentity: `system:${system.sha256}`, updatedAt: 0, encoding: "identity", bytes: first.bytes });
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("dolly-image-artifacts-v3");
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("dolly-image-artifacts-v3", 2);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("images", { keyPath: "id" });
        store.createIndex("slot", ["buildId", "slot"]);
        store.put({ ...first, id: `${first.buildId}:${first.recipeSha256}`, slot });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const legacyDiscarded = await loadImageArtifactDescriptor(first.recipeSha256) === null;
    const upgraded = await saveImageArtifact(first, slot) &&
      (await loadImageArtifact(await loadImageArtifactDescriptor(first.recipeSha256)))?.sha256 === first.sha256;
    const sessionPreserved = await sha256((await loadStoredSession("cache-migration-proof")).bytes) === first.sha256;
    return { rejected, atomic: afterFailure?.sha256 === first.sha256, staleRejected, corruptionRejected,
      oldDescriptorGone, oldPayloadGone, concurrent, recovered, legacyDiscarded, upgraded, sessionPreserved };
  }, system), { rejected: true, atomic: true, staleRejected: true, corruptionRejected: true, oldDescriptorGone: true,
    oldPayloadGone: true, concurrent: true, recovered: true, legacyDiscarded: true, upgraded: true, sessionPreserved: true });
  await page.close();

  // Without published system metadata, a fresh tab builds system from the
  // published system-tools instead of downloading system; that build fetches
  // only the sources system's own recipe names.
  hideSystemMetadata = true;
  const missing = await browser.newPage();
  missing.setDefaultTimeout(120_000);
  await missing.addInitScript(instrument, iterationRecipe(system, "iteration-one"));
  try {
    const built = await boot(missing, "iteration-one", "/dist/static/session-recovery/");
    assert.ok(server.requests.has("/dist/dolly-system-system-snapshot.mjs"));
    assert.equal(server.requests.has("/dist/dolly-system-system.snapshot"), false);
    assert.deepEqual([built.payloadReads, built.downloads], [[], toolsPacks]);
  } finally { hideSystemMetadata = false; }
});
