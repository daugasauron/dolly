import { ImageBuildService } from "./service.mjs";
import { buildLog } from "../../page/build-log.mjs";

// BUILDER is what the page's imageBuilder resolves to (README.md).
export function mountImageBuild(http, builder, mount, keyboard) {
  const configuration = { http: http.builder };
  const service = new ImageBuildService(builder.inspect,
    (source, report, signal) => builder.build(source, configuration, report, signal));
  const panel = document.createElement("section");
  panel.id = "image-build";
  panel.hidden = true;
  // An adopted style sheet, which a page's style-src without 'unsafe-inline' allows.
  const look = new CSSStyleSheet();
  look.replaceSync(`#image-build { position: absolute; right: 0.6rem; bottom: 0.6rem; z-index: 7;
      width: min(520px, calc(100% - 1.2rem)); max-height: calc(100% - 1.2rem); overflow: auto; color: var(--dolly-ui-color);
      background: var(--dolly-ui-background); border: 1px solid var(--dolly-ui-accent); padding: 0.75rem; font-size: 15px; }
    #image-build[hidden], #image-build [hidden] { display: none; } #image-build p { margin: 0 0 0.6rem; }
    #image-build details { margin-bottom: 0.6rem; }
    #image-build pre { max-height: 40vh; overflow: auto; white-space: pre-wrap; font: inherit; }
    #image-build button { color: inherit; background: inherit; border: 1px solid var(--dolly-ui-quiet); font: inherit; cursor: pointer; }`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, look];
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
      try { builder.open({ ...service.result, ...http.inherited }); }
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
  mount.append(panel);
  addEventListener("pagehide", () => service.cancel(), { once: true });
  return service;
}
