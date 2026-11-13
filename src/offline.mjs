// The site's runtime kept in this browser, so that a saved session opens when
// the network fails: the files dist/dolly-offline.json lists (the pages of a
// session, the page's and the Workers' code, the host modules and the kernel),
// in a cache named by the site and that list's digest. The service worker
// answers from it only when a request fails (coi-serviceworker.js). The page
// alone writes it, each file checked against the list's SHA-256 for it; nothing
// of the guest reaches it. A cache is complete once it holds the list itself.
import { sha256 } from "./static-asset.mjs";

const prefix = site => `dolly-offline ${new URL(site).href} `;
const listUrl = site => new URL("dist/dolly-offline.json", site).href;

async function keptCaches(site) {
  return (await caches.keys()).filter(name => name.startsWith(prefix(site)));
}

// Whether SITE's runtime is kept whole.
export async function runtimeKept(site) {
  for (const name of await keptCaches(site)) if (await (await caches.open(name)).match(listUrl(site))) return true;
  return false;
}

// Keeps SITE's runtime as its server gives it now, and removes what was kept of
// another. Rejects where the browser has no service worker or cache for the
// page (a private window of Firefox), or a file is not the one the list names.
export async function keepRuntime(site) {
  await navigator.serviceWorker.register(new URL("coi-serviceworker.js", site), { scope: new URL(site).pathname });
  const listed = await fetch(listUrl(site), { cache: "no-cache" });
  if (!listed.ok) throw new Error("this site lists no runtime to keep");
  const list = await listed.clone().text(), name = prefix(site) + await sha256(new TextEncoder().encode(list));
  const cache = await caches.open(name);
  if (!await cache.match(listUrl(site))) {
    await Promise.all(JSON.parse(list).map(async ([path, digest]) => {
      const url = new URL(path, site).href;
      if (await cache.match(url)) return;
      const response = await fetch(url, { cache: "no-cache" }), copy = response.clone();
      if (!response.ok || await sha256(await response.arrayBuffer()) !== digest) throw new Error(`${path} is not the file this site lists`);
      await cache.put(url, copy);
    }));
    await cache.put(listUrl(site), listed);
  }
  for (const other of await keptCaches(site)) if (other !== name) await caches.delete(other);
}

// Removes what is kept of SITE's runtime.
export async function clearRuntime(site) {
  for (const name of await keptCaches(site)) await caches.delete(name);
}
