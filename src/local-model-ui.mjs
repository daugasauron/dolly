import { LocalModelService } from "./local-model-service.mjs";
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL } from "./local-model-contract.mjs";

export function toggleLocalModel() {
  const panel = document.querySelector("#local-model");
  if (!panel) return;
  panel.hidden = !panel.hidden;
  (panel.hidden ? document.querySelector("#keyboard") : panel.querySelector('[tabindex="0"]'))?.focus({ preventScroll: true });
}

export function mountLocalModel() {
  const service = new LocalModelService();
  const panel = document.createElement("section");
  panel.id = "local-model";
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML = `<header><span>Local model</span><span>Ctrl+Shift+L</span></header>
    <ul role="menu" aria-label="Local model">
      ${LOCAL_MODELS.map(model => `<li role="menuitemradio" data-action="load" data-model="${model.id}" tabindex="-1">
        <span>${model.name.replace(" · WebGPU", "")}</span><span>${(model.download_bytes / 1e9).toFixed(2)} GB</span></li>`).join("")}
      <li role="menuitem" data-action="stop" tabindex="-1">Stop generation</li>
      <li role="menuitem" data-action="unload" tabindex="-1">Unload</li>
      <li role="menuitem" data-action="remove" tabindex="-1">Clear cached models</li>
    </ul>
    <p role="status"></p>
    <p>Use the same model in Pi.<br>↑↓ choose · Enter select · Esc close</p>
    <details id="local-model-help"><summary>GPU setup</summary>
      <p>Enable graphics acceleration in <code>chrome://settings/system</code>,
      then relaunch Chrome. In <code>chrome://gpu</code>, check that WebGPU is
      hardware accelerated.</p>
      <p>On Linux, Chrome may require the experimental
      <code>chrome://flags/#enable-unsafe-webgpu</code> and
      <code>chrome://flags/#enable-vulkan</code> flags, then a restart.
      These are experimental; reset them if Chrome becomes unstable.</p>
      <p>Dolly automatically uses FP16 when available, otherwise FP32.
      Choose the same Qwen size in either browser; FP32 needs more GPU memory.
      In Firefox, update the browser and driver, then check WebGPU in
      <code>about:support</code>. Linux may require the experimental
      <code>dom.webgpu.enabled</code> preference in <code>about:config</code>;
      restart after changing it. Reset it if Firefox becomes unstable.</p>
      <p>Dolly needs HTTPS (or localhost) and a hardware GPU. Software rendering
      is insufficient. Select text to copy with Ctrl+C or Ctrl+Shift+C.</p>
      <p><a href="${new URL('../docs/browser-local-models.md#chrome-setup', import.meta.url)}"
      target="_blank" rel="noopener">More setup help</a> · You can also choose a
      remote provider in Pi.</p>
    </details>`;
  const items = [...panel.querySelectorAll("[data-action]")];
  const available = () => items.filter(item => !item.hidden);
  let current = items.find(item => item.dataset.model === DEFAULT_LOCAL_MODEL.id);
  function select(item, focus = false) {
    current = item;
    for (const candidate of items) candidate.tabIndex = candidate === item ? 0 : -1;
    if (focus) item?.focus({ preventScroll: true });
  }
  function render() {
    panel.dataset.state = service.state;
    panel.querySelector('[role="status"]').textContent = service.detail;
    if (service.state === "error" && /WebGPU|GPU adapter|shader-f16/.test(service.detail)) {
      panel.querySelector("details").open = true;
    }
    for (const item of items) {
      const action = item.dataset.action;
      item.hidden = action === "stop" ? !["generating", "stopping"].includes(service.state)
        : action === "unload" && ["unloaded", "clearing"].includes(service.state);
      item.setAttribute("aria-disabled", String(action === "load"
        ? !["unloaded", "error", "ready"].includes(service.state) : service.state === "clearing"));
      if (action === "load") item.setAttribute("aria-checked", String(item.dataset.model === service.model?.id));
    }
    const focused = items.includes(document.activeElement) && document.activeElement.hidden;
    select(available().includes(current) ? current : available()[0], focused);
  }
  async function activate(item) {
    if (!available().includes(item) || item.getAttribute("aria-disabled") === "true") return;
    select(item);
    const action = item.dataset.action;
    if (action === "load") return service.load(item.dataset.model);
    if (action === "stop") return service.stop();
    service.dispose();
    if (action !== "remove") return;
    service.status("clearing", "Clearing model caches…");
    try {
      // Delete locally: WebLLM's upstream helper fetches uncached metadata.
      for (const name of ["webllm/model", "webllm/config", "webllm/wasm"]) {
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("Close other Dolly tabs using the model, then retry."));
        });
      }
      service.status("unloaded", "Model caches removed.");
    } catch (error) { service.status("error", `Could not clear model caches: ${error.message}`); }
  }
  panel.addEventListener("click", event => {
    const item = event.target.closest("[data-action]");
    if (item) void activate(item);
  });
  panel.addEventListener("focusin", event => {
    const item = event.target.closest("[data-action]");
    if (item) select(item);
  });
  panel.addEventListener("keydown", event => {
    const choices = available(), index = choices.indexOf(current);
    if (event.key === "Escape") toggleLocalModel();
    else if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyC") {
      const selection = getSelection();
      if (selection && panel.contains(selection.anchorNode) && !selection.isCollapsed) {
        void navigator.clipboard.writeText(selection.toString()).catch(() => {});
      }
    }
    else if (!event.target.closest("[data-action]") || event.ctrlKey || event.metaKey || event.altKey || event.key === "Tab") return;
    else if (event.key === "ArrowDown") select(choices[(index + 1) % choices.length], true);
    else if (event.key === "ArrowUp") select(choices[(index - 1 + choices.length) % choices.length], true);
    else if (event.key === "Home") select(choices[0], true);
    else if (event.key === "End") select(choices.at(-1), true);
    else if (["Enter", " "].includes(event.key)) { if (!event.repeat) void activate(current); }
    else return;
    event.preventDefault();
  });
  // Menu input stays outside Dolly's terminal event mailbox.
  for (const event of ["keydown", "keyup", "pointerdown", "click"]) panel.addEventListener(event, e => e.stopPropagation());
  addEventListener("pointerdown", event => {
    if (!panel.hidden && !panel.contains(event.target)) toggleLocalModel();
  }, { capture: true });
  service.addEventListener("change", render);
  document.body.append(panel);
  addEventListener("pagehide", () => service.dispose(), { once: true });
  render();
  return service;
}
