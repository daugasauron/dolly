import { MAX_SNAPSHOT_BYTES } from "./snapshot-records.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { describeImageArtifact, loadImageArtifact, sha256 } from "./image-artifact.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";
import { publicURL } from "./static-asset.mjs";

export async function loadCustomImage(source, descriptor) {
  if (inspectDollyfile(source).kind !== "image" || descriptor?.buildId !== DOLLY_IMAGE_BUILD_ID ||
      descriptor.recipeSha256 !== await sha256(new TextEncoder().encode(source))) {
    throw new Error("Completed custom image does not match this Dollyfile/runtime. Rebuild it.");
  }
  const artifact = await loadImageArtifact(descriptor);
  if (!artifact) throw new Error("Completed custom image is missing or changed in the browser cache. Rebuild the exact image, or open /sessions to recover saved files. Saved sessions have not been changed.");
  return artifact;
}

export async function checkedCustomArtifact(source, candidate) {
  if (inspectDollyfile(source).kind !== "image" || candidate?.buildId !== DOLLY_IMAGE_BUILD_ID ||
      !(candidate.bytes instanceof ArrayBuffer) || candidate.bytes.byteLength > MAX_SNAPSHOT_BYTES ||
      candidate.recipeSha256 !== await sha256(new TextEncoder().encode(source))) {
    throw new Error("Invalid completed custom image");
  }
  const artifact = await describeImageArtifact(candidate.bytes, candidate.recipeSha256, candidate.inputs);
  if (candidate.sha256 !== artifact.sha256) throw new Error("Completed custom image integrity mismatch");
  return artifact;
}

// Call only from the user's Open image gesture after a build completes.
// Only a fixed app route is navigable; the recipe never supplies a host URL.
// With the Dollyfile, the tab inherits the completed artifact and what the
// host modules of the building page hand down (their restrictions).
export function openCustomImage({ source, ...inherited }) {
  const target = window.open("about:blank", "_blank");
  if (!target) throw new Error("Popup blocked. Choose Open image to retry.");
  try {
    target.sessionStorage.setItem("dolly-custom-source", source);
    target.sessionStorage.setItem("dolly-custom-inherited", JSON.stringify(inherited));
    target.opener = null;
    target.location.replace(publicURL("custom/run/"));
  } catch (error) {
    target.close();
    throw error;
  }
}

// The custom image this tab was opened with: its Dollyfile and, after a build,
// what it inherits; undefined when the tab has none.
export function storedCustomImage() {
  const source = sessionStorage.getItem("dolly-custom-source");
  if (!source) return undefined;
  return { source, ...JSON.parse(sessionStorage.getItem("dolly-custom-inherited") ?? "{}") };
}
