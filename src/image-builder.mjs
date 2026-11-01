import { buildHost, hostRegistry } from "../host/modules.mjs";
import { hostRequirement } from "../host/requirements.mjs";
import { imageBase, imageDefinition } from "./images.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";

// Disposable Wasm userspace on the runtime the image declares, with the build
// host's modules, configured as the caller's host says (host.builder): the
// caller's browser policy and no display, file picker, local service or ENTRY.
// MODULES are the URLs of the module.json of each host module the page has.
// Used for dependencies and Studio builds. ARTIFACTS are the build's inputs,
// each one's bytes a Blob the Worker reads; it resolves to the built artifact,
// verified and in the image cache.
export async function buildImage(image, artifacts, configuration, report, { modules, customSource, signal } = {}) {
  signal?.throwIfAborted();
  const declared = image === "custom" ? inspectDollyfile(customSource).hostRequirements
    : imageDefinition(image).hostRequirements;
  let worker;
  // The build registers the build host and every module the image and its
  // inputs declare: it enables only the runtime and the build host, but a step
  // may run a program linked against a declared module's client (transfer's
  // download --help), which the Worker admits by that module's ABI.
  const needed = new Set([...buildHost, ...declared, ...artifacts.flatMap(artifact => artifact.hostRequirements)]
    .map(value => hostRequirement(value).name));
  const manifests = await Promise.all(modules.map(async url => ({ url, ...(await import(url, { with: { type: "json" } })).default })));
  const registry = await hostRegistry(manifests.filter(({ name }) => needed.has(name)).map(({ url }) => url));
  const host = await registry.createHost("browser", registry.buildHostFor(declared),
    { send: message => worker.postMessage(message), configuration });
  let abort, result;
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  try {
    signal?.throwIfAborted();
    worker = new Worker(new URL("./build-worker.mjs", import.meta.url), {
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
          else if (message.type === "image-built") resolve(message.artifact);
          else if (message.type === "error") reject(new Error(message.message));
        } catch (error) { reject(error); }
      });
      // An input's Blob is cloned by reference: every Worker reads the one copy.
      worker.postMessage({ type: "configure", mode: "rebuild", image, buildOnly: true,
        artifacts: artifacts.map(({ buildId, recipeSha256, sha256, bytes }) => ({ buildId, recipeSha256, sha256, bytes })),
        images: imageBase.href, modules: registry.urls, hostModules: host.enabled, hostConfiguration: host.configuration,
        ...(customSource === undefined ? {} : { customSource }) });
    });
  } finally {
    signal?.removeEventListener("abort", abort);
    host.dispose();
    worker?.terminate();
    const tail = decoder.decode();
    if (tail && !signal?.aborted) report(tail);
  }
  signal?.throwIfAborted();
  return result;
}
