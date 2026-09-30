import { createGpuBridge } from "./bridge.mjs";
import { DOLLY_ERRNO as E } from "../../dist/dolly-errno.mjs";

export async function check() {
  if (!globalThis.navigator?.gpu) return "WebGPU is unavailable in this browser";
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    return adapter ? null : "the browser did not provide a GPU adapter";
  } catch (error) { return `GPU adapter initialization failed: ${error.message}`; }
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
    get surfaceSize() { return status.active ? { width: status.width, height: status.height } : undefined; },
    messages: { "gpu-status"(message) {
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
