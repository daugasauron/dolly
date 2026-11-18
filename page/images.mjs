// The images a page runs and where their files are. An image directory holds
// dist/dolly-images.json (its catalog), each image's metadata and packs under
// dist/, and the recipes and sources at their site paths. The site is one such
// directory; an embedding names its own (boot's `images`). The page and the
// Worker each load it once, before anything reads it, with the origin's
// credentials; packages@0 reads another directory with the fetch its Worker
// gives (host/packages/worker.mjs).
export let DOLLY_IMAGES = [], DOLLY_STATIC_SOURCES = [], imageBase, directoryFetch;
export async function loadImages(base, fetchRequest) {
  imageBase = new URL(base);
  directoryFetch = fetchRequest;
  ({ images: DOLLY_IMAGES, staticSources: DOLLY_STATIC_SOURCES } = await directoryJSON("dist/dolly-images.json"));
}

// The JSON file at PATH of the image directory.
export async function directoryJSON(path) {
  const url = new URL(path, imageBase);
  if (!directoryFetch) return (await import(url.href, { with: { type: "json" } })).default;
  const response = await directoryFetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

// The catalog's record of an image, by name; undefined for one it lacks.
export const imageDefinition = name => DOLLY_IMAGES.find(definition => definition.image === name);
