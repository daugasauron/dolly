// The packs this browser has read, kept in origin-private storage so that an
// image starts again, and a session saved on it opens, without downloading
// them. A pack is a file named by its SHA-256, written as its bytes stream to
// the reader and kept only once the reader has checked them against that
// digest; a kept pack is checked the same way at every use, and removed when
// it fails. Every image read leaves a record of its packs; once no image is
// being read on the origin, what the records of this runtime's images do not
// name is removed. Only the page and its Workers write here, from an image's
// trusted metadata; nothing of the guest reaches it.
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { imageBase, imageDefinition } from "./images.mjs";
import { sha256 } from "./static-asset.mjs";

const STORE = "dolly-packs", LOCK = "dolly-packs";
const encoder = new TextEncoder();

async function storeDirectories() {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(STORE, { create: true });
  const [packs, records] = await Promise.all(["packs", "images"].map(name => root.getDirectoryHandle(name, { create: true })));
  return { packs, records };
}

// Holds the store's lock in MODE until the function it resolves to is
// called, which resolves once the lock is released.
const hold = mode => new Promise((held, refused) => {
  const released = navigator.locks.request(LOCK, { mode }, () => new Promise(release => held(() => {
    release();
    return released;
  })));
  released.catch(refused);
});

async function writeFile(directory, name, data) {
  const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
  await writable.write(data);
  await writable.close();
}

// Where the browser refuses origin-private storage or Web Locks (and in
// Node), every pack is downloaded.
const noStore = {
  kept: async () => null,
  keeping: async (pack, body) => ({ body, keep() {}, discard() {} }),
  close() {},
};

// The store as the reader of IMAGE's PACKS uses it: kept(pack) is a pack's
// part read from here, or null; keeping(pack, body) the part of a download,
// written here as it is read. A part's keep() is called once its bytes match
// the pack's digest, discard() otherwise. close(complete) ends the reading;
// while it lasts, nothing is removed.
export async function openPackStore(image, packs) {
  let store, release;
  try {
    store = await storeDirectories();
    release = await hold("shared");
    const record = { directory: imageBase.href, image, buildId: DOLLY_IMAGE_BUILD_ID, packs: packs.map(pack => pack.sha256) };
    await writeFile(store.records, await sha256(encoder.encode(`${record.directory}\0${image}`)), JSON.stringify(record));
  } catch {
    release?.();
    return noStore;
  }
  return {
    async kept(pack) {
      try {
        const file = await (await store.packs.getFileHandle(pack.sha256)).getFile();
        if (file.size !== pack.encodedByteLength) return null;
        return { body: file.stream(), keep() {}, discard: () => store.packs.removeEntry(pack.sha256).catch(() => {}) };
      } catch { return null; }
    },
    async keeping(pack, body) {
      // The file holds what was written only once it is closed. A write that
      // fails, such as one over the quota, leaves the pack unkept.
      let writable = await store.packs.getFileHandle(pack.sha256, { create: true })
        .then(handle => handle.createWritable()).catch(() => null);
      const discard = async () => {
        const unkept = writable;
        writable = null;
        await unkept?.abort().catch(() => {});
      };
      return {
        body: body.pipeThrough(new TransformStream({
          async transform(chunk, controller) {
            await writable?.write(chunk).catch(discard);
            controller.enqueue(chunk);
          },
        })),
        keep: () => writable?.close().catch(discard),
        discard,
      };
    },
    close(complete) {
      void release().then(() => complete &&
        navigator.locks.request(LOCK, { ifAvailable: true }, lock => lock && prune(store))).catch(() => {});
    },
  };
}

// Removes the records of images no page of this runtime starts (another
// runtime's, and those this directory's catalog no longer has), then every
// pack the remaining records do not name. An image rebuilt since it was last
// read keeps its former packs until it is read again.
async function prune({ packs, records }) {
  const used = new Set(), stale = [], unused = [];
  for await (const [name, handle] of records) {
    try {
      const record = JSON.parse(await (await handle.getFile()).text());
      if (record.buildId === DOLLY_IMAGE_BUILD_ID && (record.directory !== imageBase.href || imageDefinition(record.image))) {
        for (const pack of record.packs) used.add(pack);
        continue;
      }
    } catch {}
    stale.push(name);
  }
  for (const name of stale) await records.removeEntry(name).catch(() => {});
  for await (const name of packs.keys()) if (!used.has(name)) unused.push(name);
  for (const name of unused) await packs.removeEntry(name).catch(() => {});
}

// What the store holds: its packs and their bytes.
export async function packStoreSize() {
  let count = 0, bytes = 0;
  try {
    const store = await (await navigator.storage.getDirectory()).getDirectoryHandle(STORE);
    for await (const handle of (await store.getDirectoryHandle("packs")).values()) {
      count += 1;
      bytes += (await handle.getFile()).size;
    }
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
  return { count, bytes };
}

// Removes the store once no image is being read on the origin.
export async function clearPackStore() {
  await navigator.locks.request(LOCK, async () =>
    (await navigator.storage.getDirectory()).removeEntry(STORE, { recursive: true }).catch(error => {
      if (error.name !== "NotFoundError") throw error;
    }));
}
