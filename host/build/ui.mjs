import { ImageBuildService } from "./service.mjs";
import { buildImage } from "../../src/image-builder.mjs";
import { prepareImageArtifacts } from "../../src/image-build.mjs";
import { loadImageArtifactDescriptor } from "../../src/image-artifact.mjs";
import { openCustomImage } from "../../src/custom-image.mjs";
import { buildLog } from "../../src/build-log.mjs";

export function mountImageBuild(http, keyboard) {
  const builders = { http: http.builder };
  const service = new ImageBuildService(async (source, report, signal) => {
    const artifacts = await prepareImageArtifacts("custom", source,
      (image, artifacts) => buildImage(image, artifacts, builders, report, { signal }),
      text => report(text + "\n"), signal);
    signal.throwIfAborted();
    const artifact = await buildImage("custom", artifacts, builders, report, { signal, customSource: source });
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
    <details><summary>Review Dollyfile</summary><pre data-recipe></pre></details>
    <pre data-output aria-label="Build output" tabindex="0"></pre>
    <p>One build · 45 minute limit · existing HTTP policy</p>
    <button data-action="cancel">Cancel</button>
    <button data-action="open">Open image</button>
    <button data-action="close">Close</button>`;
  const output = buildLog(panel.querySelector("[data-output]"));
  function render() {
    panel.hidden = false;
    panel.dataset.state = service.state;
    panel.querySelector('[role="status"]').textContent = service.detail;
    panel.querySelector("[data-recipe]").textContent = service.active?.source ?? service.result?.source ?? "";
    if (service.state === "building") output.clear();
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
      try { openCustomImage({ ...service.result, ...http.inherited }); }
      catch (error) { panel.querySelector('[role="status"]').textContent = error.message; }
    } else if (action === "close") panel.hidden = true;
    if (action) keyboard?.focus({ preventScroll: true });
  });
  for (const event of ["keydown", "keyup", "pointerdown", "click"]) panel.addEventListener(event, e => e.stopPropagation());
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape" || (event.ctrlKey && !event.shiftKey && event.code === "KeyC")) {
      event.preventDefault();
      service.cancel();
      panel.hidden = true;
      keyboard?.focus({ preventScroll: true });
    }
  });
  service.addEventListener("change", render);
  service.addEventListener("log", event => output.append(event.data));
  document.body.append(panel);
  addEventListener("pagehide", () => service.cancel(), { once: true });
  return service;
}
