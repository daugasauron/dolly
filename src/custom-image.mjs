import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { describeImageArtifact, loadImageArtifact, sha256 } from "./image-artifact.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";

export async function loadCustomImage(source, descriptor) {
  if (inspectDollyfile(source).kind !== "image" || descriptor?.buildId !== DOLLY_BUILD_ID ||
      descriptor.recipeSha256 !== await sha256(new TextEncoder().encode(source))) {
    throw new Error("Completed custom image does not match this Dollyfile/runtime. Rebuild it.");
  }
  const artifact = await loadImageArtifact(descriptor);
  if (!artifact) throw new Error("Completed custom image is missing or changed in the browser cache. Rebuild it.");
  return artifact;
}

export async function checkedCustomArtifact(source, candidate) {
  if (inspectDollyfile(source).kind !== "image" || candidate?.buildId !== DOLLY_BUILD_ID ||
      !(candidate.bytes instanceof ArrayBuffer) || candidate.bytes.byteLength > 512 * 1024 * 1024 ||
      candidate.recipeSha256 !== await sha256(new TextEncoder().encode(source))) {
    throw new Error("Invalid completed custom image");
  }
  const artifact = await describeImageArtifact(candidate.bytes, candidate.recipeSha256, candidate.inputs);
  if (candidate.sha256 !== artifact.sha256) throw new Error("Completed custom image integrity mismatch");
  return artifact;
}

// Call from a user gesture, or pass the blank tab reserved at build approval.
// Only a fixed app route is navigable; the recipe never supplies a host URL.
export function openCustomImage(result, target = window.open("about:blank", "_blank")) {
  if (!target || target.closed) throw new Error("Popup blocked or tab closed. Choose Open image to retry.");
  if (target.location.href !== "about:blank") throw new Error("The build tab was navigated elsewhere. Choose Open image to retry.");
  target.sessionStorage.setItem("dolly-custom-source", result.source);
  target.sessionStorage.setItem("dolly-custom-artifact", JSON.stringify(result.artifact));
  target.sessionStorage.setItem("dolly-custom-policy", JSON.stringify(result.policies));
  target.opener = null;
  const url = new URL("../custom/run/", import.meta.url);
  url.pathname = url.pathname.replace(/\/_dolly\/[0-9a-f]{64}\//, "/");
  target.location.replace(url);
}
