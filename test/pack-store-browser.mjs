// The packs an image reads stay in the browser (src/pack-store.mjs). The server
// answers for packs itself, uncacheable, so no start reads one from the HTTP
// cache, and counts them:
// - a second start downloads none, and removes what no image of this runtime
//   names: another runtime's image's packs, and packs no image names;
// - a session saved on the image opens while the server refuses every pack;
// - a kept pack that no longer matches its digest fails the start and is
//   removed: the next start downloads it again;
// - the sessions page clears the store, after which a start downloads every pack;
// - Save asks for persistent storage (Firefox answers through a preference here).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";
import { DOLLY_SYSTEM_SNAPSHOT } from "../dist/dolly-default-system-snapshot.mjs";

const projectDir = new URL("..", import.meta.url).pathname, packs = DOLLY_SYSTEM_SNAPSHOT.packs;
let refusing = false, downloads = 0;
const handle = async (request, response, path, headers) => {
  if (!/^\/dist\/packs\/[0-9a-f]{64}\.snapshot\.gz$/.test(path)) return false;
  if (refusing) response.writeHead(404, headers).end();
  else {
    downloads++;
    response.writeHead(200, { ...headers, "content-type": "application/octet-stream" }).end(await readFile(projectDir + path));
  }
  return true;
};

// The store's directory of packs, or of image records, in the page.
const kept = (page, directory = "packs") => page.evaluate(async directory => {
  const store = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("dolly-packs")).getDirectoryHandle(directory);
  return Array.fromAsync(store.keys());
}, directory);

await browserTest("pack store", { server: { handle }, timeout: 240_000,
  launch: { firefox: { "permissions.default.persistent-storage": 1 } } }, async ({ name, open }) => {
  downloads = 0;
  const { page, submit } = await open();
  assert.equal(downloads, packs.length);
  const start = async (path = "/default/") => {
    await page.goto(new URL(path, page.url()).href);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
    return page.evaluate(() => document.documentElement.dataset.dollyStatus);
  };

  const [stale, unnamed] = ["a", "b"].map(digit => digit.repeat(64));
  await page.evaluate(async ({ stale, unnamed }) => {
    const store = await (await navigator.storage.getDirectory()).getDirectoryHandle("dolly-packs");
    const write = async (directory, name, text) => {
      const writable = await (await (await store.getDirectoryHandle(directory)).getFileHandle(name, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    };
    await write("packs", stale, "another runtime's pack");
    await write("packs", unnamed, "nobody's pack");
    await write("images", "c".repeat(64), JSON.stringify({ directory: location.origin + "/", image: "default",
      buildId: "sha256:another-runtime", packs: [stale] }));
  }, { stale, unnamed });
  downloads = 0;
  assert.equal(await start(), "ready");
  assert.equal(downloads, 0, "a second start downloaded packs");
  // The start removes them once it is over.
  for (const deadline = Date.now() + 10_000; (await kept(page)).length !== packs.length;) {
    assert.ok(Date.now() < deadline, "the store kept packs no image of this runtime names");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual((await kept(page)).sort(), packs.map(pack => pack.sha256).sort());
  assert.equal((await kept(page, "images")).length, 1);

  const session = `packs-${Date.now()}`;
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  assert.equal(await submit("echo kept > $HOME/kept"), 0);
  await page.evaluate(session => __dolly.saveSession(session), session);
  if (name === "firefox") assert.equal(await page.evaluate(() => navigator.storage.persisted()), true);
  refusing = true;
  assert.equal(await start(`/session/?name=${session}`), "ready", await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  assert.equal(await page.evaluate(() => __dolly.submit('test "$(cat $HOME/kept)" = kept')), 0);
  refusing = false;

  const [damaged] = packs;
  await page.evaluate(async ({ sha256, encodedByteLength }) => {
    const store = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("dolly-packs")).getDirectoryHandle("packs");
    const writable = await (await store.getFileHandle(sha256)).createWritable();
    await writable.write(new Uint8Array(encodedByteLength).fill(31));
    await writable.close();
  }, damaged);
  downloads = 0;
  assert.equal(await start(), "failed");
  assert.equal((await kept(page)).includes(damaged.sha256), false);
  assert.equal(await start(), "ready");
  assert.equal(downloads, 1);

  await page.goto(new URL("/sessions/", page.url()).href);
  await page.waitForFunction(() => document.documentElement.dataset.sessionsStatus === "ready");
  await page.click("#clear-packs");
  await page.waitForFunction(async () => {
    const root = await navigator.storage.getDirectory();
    return !await Array.fromAsync(root.keys()).then(names => names.includes("dolly-packs"));
  });
  downloads = 0;
  assert.equal(await start(), "ready");
  assert.equal(downloads, packs.length);
});
