// The images a page runs and where their files are. An image directory holds
// dist/dolly-images.json (its catalog), each image's metadata and packs under
// dist/, and the recipes and sources at their site paths. The site is one such
// directory; an embedding names its own (boot's `images`). The page and the
// Worker each load it once, before anything reads it.
export let DOLLY_IMAGES = [], DOLLY_STATIC_SOURCES = [], imageBase;
export async function loadImages(base) {
  imageBase = new URL(base);
  ({ images: DOLLY_IMAGES, staticSources: DOLLY_STATIC_SOURCES } =
    (await import(new URL("dist/dolly-images.json", imageBase).href, { with: { type: "json" } })).default);
}

// The catalog's record of an image, by name; undefined for one it lacks.
export const imageDefinition = name => DOLLY_IMAGES.find(definition => definition.image === name);

// The files of the directory a build reads by site path, with their sizes:
// every recipe and every source (http@0's trusted sources).
export const bootstrapSources = () => [
  ...DOLLY_IMAGES.map(definition => ({ path: `/${definition.dollyfile}`, byteLength: definition.byteLength })),
  ...DOLLY_STATIC_SOURCES,
];
