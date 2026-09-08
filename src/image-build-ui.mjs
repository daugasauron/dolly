import { ImageBuildService } from "./image-build-service.mjs";
import { buildImage } from "./image-builder.mjs";
import { prepareImageArtifacts } from "./image-build.mjs";
import { describeImageArtifact, loadImageArtifactDescriptor, sha256 } from "./image-artifact.mjs";
import { openCustomImage } from "./custom-image.mjs";

export function mountImageBuild(network, policies) {
  const service = new ImageBuildService(async (source, report, signal) => {
    const artifacts = await prepareImageArtifacts("custom", source,
      (image, artifacts) => buildImage(image, artifacts, network, report, { signal }),
      text => report(text + "\n"), signal);
    signal.throwIfAborted();
    const result = await buildImage("custom", artifacts, network, report, { signal, customSource: source });
    const artifact = await describeImageArtifact(result.bytes, await sha256(new TextEncoder().encode(source)), result.inputs);
    signal.throwIfAborted();
    const descriptor = await loadImageArtifactDescriptor(artifact.recipeSha256, artifact.inputs);
    if (!descriptor || descriptor.sha256 !== artifact.sha256) {
      throw new Error("Image built, but could not be saved for opening. Free browser storage and rebuild.");
    }
    return descriptor;
  });
  const panel = document.createElement("section");
  panel.id = "image-build";
  panel.hidden = true;
  panel.innerHTML = `<p role="status"></p>
    <details><summary>Review Dollyfile</summary><pre></pre></details>
    <p>One build · 45 minute limit · existing HTTP policy</p>
    <button data-action="cancel">Cancel</button>
    <button data-action="open">Open image</button>
    <button data-action="close">Close</button>`;
  function render() {
    panel.hidden = false;
    panel.dataset.state = service.state;
    panel.querySelector('[role="status"]').textContent = service.detail;
    panel.querySelector("pre").textContent = service.active?.source ?? service.result?.source ?? "";
    for (const button of panel.querySelectorAll("button")) {
      button.hidden = button.dataset.action === "cancel" ? service.state !== "building"
        : button.dataset.action === "open" ? service.state !== "ready"
        : ["building", "stopping"].includes(service.state);
    }
  }
  panel.addEventListener("click", event => {
    const action = event.target.dataset.action;
    if (action === "cancel") service.cancel();
    else if (action === "open" && service.state === "ready") {
      try { openCustomImage({ ...service.result, policies }); }
      catch (error) { panel.querySelector('[role="status"]').textContent = error.message; }
    } else if (action === "close") panel.hidden = true;
    if (action) document.querySelector("#keyboard")?.focus({ preventScroll: true });
  });
  for (const event of ["keydown", "keyup", "pointerdown", "click"]) panel.addEventListener(event, e => e.stopPropagation());
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape" || (event.ctrlKey && !event.shiftKey && event.code === "KeyC")) {
      event.preventDefault();
      service.cancel();
      panel.hidden = true;
      document.querySelector("#keyboard")?.focus({ preventScroll: true });
    }
  });
  service.addEventListener("change", render);
  document.body.append(panel);
  addEventListener("pagehide", () => service.cancel(), { once: true });
  return service;
}
