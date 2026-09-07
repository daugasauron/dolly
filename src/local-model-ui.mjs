import { LocalModelService } from "./local-model-service.mjs";

export function mountLocalModel() {
  const service = new LocalModelService();
  const panel = document.createElement("details");
  panel.id = "local-model";
  panel.innerHTML = `<summary>Local model</summary>
    <strong>Qwen3.5 2B</strong>
    <p>Runs in this tab using WebGPU. First load downloads about 1.1 GB; cached weights are reused. Requires shader-f16.</p>
    <p role="status"></p><button type="button" data-action="load">Load Qwen</button>
    <button type="button" data-action="stop">Stop</button>
    <button type="button" data-action="unload">Unload</button>
    <button type="button" data-action="remove">Remove cached model</button>
    <p>Select <b>webgpu</b> in Pi’s model picker after loading. Small models can make poor tool choices; review their work.</p>`;
  const load = panel.querySelector('[data-action="load"]');
  const stop = panel.querySelector('[data-action="stop"]');
  const unload = panel.querySelector('[data-action="unload"]');
  const remove = panel.querySelector('[data-action="remove"]');
  function render() {
    panel.dataset.state = service.state;
    panel.querySelector('[role="status"]').textContent = service.detail;
    load.disabled = !["unloaded", "error"].includes(service.state);
    stop.disabled = !["generating", "stopping"].includes(service.state);
    unload.disabled = ["unloaded", "clearing"].includes(service.state);
    remove.disabled = service.state === "clearing";
  }
  load.addEventListener("click", () => { void service.load(); });
  stop.addEventListener("click", () => { void service.stop(); });
  unload.addEventListener("click", () => service.dispose());
  remove.addEventListener("click", async () => {
    service.dispose();
    service.status("clearing", "Removing the cached model…");
    try {
      // One approved model uses WebLLM's three IndexedDB scopes. Its upstream
      // deletion helper fetches uncached metadata; local deletion needs no IO.
      for (const name of ["webllm/model", "webllm/config", "webllm/wasm"]) {
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("Close other Dolly tabs using the model, then retry."));
        });
      }
      service.status("unloaded", "Cached model removed. Loading it again will download the weights.");
    } catch (error) { service.status("error", `Could not remove cached model: ${error.message}`); }
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
