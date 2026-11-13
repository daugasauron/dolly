// The packages@0 Worker reads one package of an image directory and merges its
// packs into its snapshot, a chunk per request, off the page's thread: the page
// must answer the guest's reads at once, since a guest that finds no record
// waits 10 ms.
import { DOLLY_IMAGES, loadImages } from "../../page/images.mjs";
import { loadPackagedSnapshotMetadata, packagedSystemSnapshot } from "../../page/packaged-snapshot.mjs";

let chunks;
onmessage = async ({ data }) => {
  try {
    if (data.directory) {
      await loadImages(data.directory);
      const definition = DOLLY_IMAGES.find(candidate => candidate.role === "package" && candidate.sha256 === data.sha256);
      if (!definition) return postMessage({ missing: true });
      const metadata = await loadPackagedSnapshotMetadata(definition.image);
      chunks = await packagedSystemSnapshot(metadata);
      postMessage({ done: false, size: metadata.byteLength });
    } else {
      const { done, value } = await chunks.next();
      postMessage({ done, value }, done ? [] : [value.buffer]);
    }
  } catch (error) {
    postMessage({ error: error.message });
  }
};
