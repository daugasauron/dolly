import { createGpuBridge } from "./bridge.mjs";
import { DOLLY_ERRNO as E } from "../../dist/dolly-errno.mjs";
import { publicURL } from "../../src/static-asset.mjs";
export { DOLLY_GPU_ABI_DIGEST as digest } from "./abi.mjs";

// The page names the adapter gpu@0 programs get before any of them runs. A
// refused module never reaches browser(), so check() also shows the refusal.
export async function check() {
  let adapter, reason = null;
  if (!globalThis.navigator?.gpu) reason = "WebGPU is unavailable in this browser";
  else try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) reason = "the browser did not provide a GPU adapter";
  } catch (error) { reason = `GPU adapter initialization failed: ${error.message}`; }
  const { vendor, architecture, description, isFallbackAdapter } = adapter?.info ?? {};
  indicate({ vendor, architecture, description, isFallbackAdapter, f16: adapter?.features.has("shader-f16") }, reason);
  return reason;
}

// Trusted page DOM over the display: guest frames cannot draw, cover or remove it.
function indicate(info, unavailable) {
  let element = document.querySelector("#gpu-status");
  if (!element) {
    element = document.body.appendChild(document.createElement("div"));
    element.id = "gpu-status";
    element.setAttribute("role", "status");
    element.style.cssText = "position:fixed;right:0.5rem;bottom:2rem;z-index:8;max-width:calc(100vw - 1rem);" +
      "padding:0.15rem 0.45rem;background:#262626;border:1px solid;font-size:13px";
  }
  if (unavailable) {
    const link = Object.assign(document.createElement("a"), { textContent: "How to enable WebGPU ↗",
      href: publicURL("docs/gpu.md#enabling-webgpu").href, target: "_blank", rel: "noopener" });
    link.style.color = "#f2d45c";
    element.replaceChildren(`No GPU: ${unavailable} · `, link);
    element.dataset.gpu = "unavailable";
    element.style.borderColor = "#e98773";
    return {};
  }
  const adapter = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unnamed WebGPU adapter";
  // SwiftShader and llvmpipe render on the CPU even where a browser does not flag them.
  const software = info.isFallbackAdapter || /swiftshader|llvmpipe/i.test(adapter);
  element.textContent = `${software ? "CPU (software GPU)" : "GPU"}: ${adapter} · ${info.f16 ? "" : "no "}shader-f16`;
  element.dataset.gpu = software ? "software" : "hardware";
  element.style.borderColor = software ? "#f2d45c" : "#77736c";
  return { adapter, isFallbackAdapter: info.isFallbackAdapter };
}

export function browser({ mount }) {
  let canvas, surface;
  if (mount) {
    canvas = document.createElement("canvas");
    canvas.id = "gpu-display";
    canvas.hidden = true;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    mount.append(canvas);
    surface = canvas.transferControlToOffscreen();
  }
  let status = {};
  return {
    configuration: { canvas: surface }, transfers: surface ? [surface] : [],
    get status() { return status; },
    page: { get gpu() { return status; } },
    get surfaceSize() { return status.active ? { width: status.width, height: status.height } : undefined; },
    // The provider reports the adapter of each device it creates, or why it has none.
    messages: { "gpu-status"({ info, unavailable, ...message }) {
      if (info || unavailable) Object.assign(message, indicate(info, unavailable));
      status = { ...status, ...message };
      if (message.active) delete status.error;
      if (canvas && message.active !== undefined) canvas.hidden = !message.active;
      if (message.error) console.warn("Dolly GPU:", message.error);
    } },
    dispose() { canvas?.remove(); },
  };
}

export function worker({ send, configuration, get }) {
  let bridge;
  return {
    bindings: { "env.dolly_gpu_dispatch": (address, bytes) => {
      if (!bridge) return -E.ENOSYS;
      return bridge.dispatch({ address, bytes });
    } },
    async start({ dolly, memory }) {
      bridge = await createGpuBridge(memory, Number(dolly._dolly_gpu_mailbox_address()), configuration.canvas,
        () => get("runtime").serviceDeferred(), status => send({ ...status, type: "gpu-status" }));
    },
    dispose() { bridge?.dispose(); bridge = null; },
  };
}
