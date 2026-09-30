import { createHost, buildHost } from "../host/modules.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { describeImageArtifact, saveImageArtifact, sha256 } from "./image-artifact.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";

// Disposable Wasm userspace, with the caller's browser policy and no display,
// file picker, local service or ENTRY. Used for dependencies and Studio builds.
export async function buildImage(image, artifacts, networkPolicy, report, { customSource, signal } = {}) {
  signal?.throwIfAborted();
  const inputs = new Map(artifacts.map(artifact => [artifact.recipeSha256, artifact]));
  let worker;
  const host = await createHost("browser", buildHost, {
    send: message => worker.postMessage(message), resources: { http: { network: networkPolicy } },
  });
  let abort, result;
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  try {
    signal?.throwIfAborted();
    worker = new Worker(new URL("./runtime-worker.mjs", import.meta.url), {
      type: "module", name: `dolly-build-${image}`,
    });
    result = await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal?.addEventListener("abort", abort, { once: true });
      worker.addEventListener("error", event => reject(new Error(event.message || "Image build worker failed")), { once: true });
      worker.addEventListener("message", ({ data: message }) => {
        try {
          void host.handle(message).catch(reject);
          if (message.type === "bootstrap") report(message.text);
          else if (message.type === "bootstrap-bytes") report(decoder.decode(message.bytes, { stream: true }));
          else if (message.type === "build-input") {
            const artifact = inputs.get(message.recipeSha256);
            if (!artifact || !(message.bytes instanceof ArrayBuffer) || message.bytes.byteLength !== artifact.byteLength) {
              throw new Error("invalid returned build input");
            }
            artifact.bytes = message.bytes;
          }
          else if (message.type === "system-snapshot") resolve({ bytes: message.bytes, inputs: message.inputs });
          else if (message.type === "error") reject(new Error(message.message));

        } catch (error) { reject(error); }
      });
      // The Worker returns each buffer after importing it into Wasm, so shared
      // dependencies remain reusable without cloning gigabytes of inputs.
      worker.postMessage({ type: "configure", mode: "rebuild", image, buildOnly: true, artifacts,
        hostModules: host.enabled, hostConfiguration: host.configuration,
        ...(customSource === undefined ? {} : { customSource }) }, [...new Set(artifacts.map(artifact => artifact.bytes))]);
    });
  } finally {
    signal?.removeEventListener("abort", abort);
    host.dispose();
    worker?.terminate();
    const tail = decoder.decode();
    if (tail && !signal?.aborted) report(tail);
  }
  // Drop the build filesystem before hashing and persisting its exported copy.
  // Otherwise large images retain both Wasm storage and browser cache copies.
  signal?.throwIfAborted();
  const definition = DOLLY_IMAGES.find(candidate => candidate.image === image);
  const recipeSha256 = image === "custom"
    ? await sha256(new TextEncoder().encode(customSource)) : definition.sha256;
  report("verifying completed image...\n");
  const artifact = await describeImageArtifact(result.bytes, recipeSha256, result.inputs);
  signal?.throwIfAborted();
  const slot = image === "custom" ? `custom:${inspectDollyfile(customSource).image}` : `/${definition.dollyfile}`;
  report("caching completed image...\n");
  const saved = await saveImageArtifact(artifact, slot);
  report(saved ? "saved completed image artifact\n" : "image built; local cache unavailable\n");
  signal?.throwIfAborted();
  return artifact;
}
