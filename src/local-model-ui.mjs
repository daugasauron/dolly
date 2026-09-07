import { LocalModelService } from "./local-model-service.mjs";
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL } from "./local-model-contract.mjs";

export function mountLocalModel() {
  const service = new LocalModelService();
  const panel = document.createElement("details");
  panel.id = "local-model";
  panel.innerHTML = `<summary>Local model</summary>
    <p><label>Model size <select aria-label="Local model size"></select></label></p>
    <p data-download></p>
    <p>Runs in this tab using WebGPU with shader-f16. One model is loaded at a time; cached weights are reused when switching.</p>
    <p role="status"></p><button type="button" data-action="load">Load Qwen</button>
    <button type="button" data-action="stop">Stop</button>
    <button type="button" data-action="unload">Unload</button>
    <button type="button" data-action="remove">Clear all model caches</button>
    <p>Select the same size under <b>webgpu</b> in Pi’s model picker. 0.8B is useful for quick experiments but weak at tool use.</p>`;
  const select = panel.querySelector("select");
  for (const model of LOCAL_MODELS) select.add(new Option(model.name + (model === DEFAULT_LOCAL_MODEL ? " (default)" : ""), model.id));
  const load = panel.querySelector('[data-action="load"]');
  const stop = panel.querySelector('[data-action="stop"]');
  const unload = panel.querySelector('[data-action="unload"]');
  const remove = panel.querySelector('[data-action="remove"]');
  function render() {
    panel.dataset.state = service.state;
    panel.querySelector('[role="status"]').textContent = service.detail;
    const selected = LOCAL_MODELS.find(model => model.id === select.value);
    panel.querySelector("[data-download]").textContent = `First load: ${(selected.download_bytes / 1e9).toFixed(2)} GB of weights. Selecting a size does not download it.`;
    select.disabled = !["unloaded", "error", "ready"].includes(service.state);
    load.disabled = select.disabled || (service.state === "ready" && service.model.id === select.value);
    load.textContent = service.state === "ready" && service.model.id !== select.value ? "Switch and load" : "Load Qwen";
    stop.disabled = !["generating", "stopping"].includes(service.state);
    unload.disabled = ["unloaded", "clearing"].includes(service.state);
    remove.disabled = service.state === "clearing";
  }
  select.addEventListener("change", render);
  load.addEventListener("click", () => { void service.load(select.value); });
  stop.addEventListener("click", () => { void service.stop(); });
  unload.addEventListener("click", () => service.dispose());
  remove.addEventListener("click", async () => {
    service.dispose();
    service.status("clearing", "Clearing all model caches…");
    try {
      // All model sizes share WebLLM's three IndexedDB scopes. Its upstream
      // deletion helper fetches uncached metadata; local deletion needs no IO.
      for (const name of ["webllm/model", "webllm/config", "webllm/wasm"]) {
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("Close other Dolly tabs using the model, then retry."));
        });
      }
      service.status("unloaded", "Model caches removed. Loading a model again will download its weights.");
    } catch (error) { service.status("error", `Could not clear model caches: ${error.message}`); }
  });
  service.addEventListener("change", render);
  panel.addEventListener("toggle", () => {
    if (!panel.open) document.querySelector("#keyboard").focus({ preventScroll: true });
  });
  // Terminal key handling must not eat activation keys or clicks in the panel.
  for (const event of ["keydown", "keyup", "pointerdown", "click"]) panel.addEventListener(event, e => e.stopPropagation());
  document.body.append(panel);
  addEventListener("pagehide", () => service.dispose(), { once: true });
  render();
  return service;
}
