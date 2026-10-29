// The packages@0 Worker merges one package's packs into its snapshot, a chunk
// per request, off the page's thread: the page must answer the guest's reads
// at once, since a guest that finds no record waits 10 ms.
import { loadImages } from "../../src/images.mjs";
import { packagedSystemSnapshot } from "../../src/packaged-snapshot.mjs";

let chunks;
onmessage = async ({ data }) => {
  try {
    if (data.image) {
      await loadImages(data.base);
      chunks = await packagedSystemSnapshot(data.image, data.metadata);
      postMessage({ done: false });
    } else {
      const { done, value } = await chunks.next();
      postMessage({ done, value }, done ? [] : [value.buffer]);
    }
  } catch (error) {
    postMessage({ error: error.message });
  }
};
