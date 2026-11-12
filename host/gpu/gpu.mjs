import { createGpuBridge } from "./bridge.mjs";
import { DOLLY_ERRNO as E } from "./abi.mjs";
export { DOLLY_GPU_ABI_DIGEST as digest } from "./abi.mjs";

// The page names the adapter gpu@0 programs get before any of them runs, or
// says that there is none. The module is admitted either way: without a
// device it grants nothing, and OPEN fails with ENODEV, so a program can fall
// back. A switch after boot passes `signal`, aborted once the registry stops
// waiting: late, it shows nothing, since nena says why.
export async function check({ signal: abandoned, ...page }) {
  let adapter, reason = null;
  if (!globalThis.navigator?.gpu) reason = "WebGPU is unavailable in this browser";
  else try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) reason = "the browser did not provide a GPU adapter";
  } catch (error) { reason = `GPU adapter initialization failed: ${error.message}`; }
  const { vendor, architecture, description, isFallbackAdapter } = adapter?.info ?? {};
  if (abandoned?.aborted) return null;
  indicate(page, { vendor, architecture, description, isFallbackAdapter, f16: adapter?.features.has("shader-f16") }, reason);
  if (reason) page.showStatus?.(`No WebGPU adapter (${reason}): programs that need the GPU cannot open it`);
  return null;
}

// A new adapter state shows the indicators again; no adapter holds them shown.
function announce({ indicators }, element, state, borderColor) {
  if (element.dataset.gpu !== state) {
    indicators.hold("gpu", state === "unavailable");
    indicators.show();
  }
  element.dataset.gpu = state;
  element.style.borderColor = borderColor;
}

// The page's indicator names the adapter, or says why there is none. Trusted
// page DOM over the display: guest frames cannot draw, cover or remove it, and
// only its link takes clicks.
function indicate(page, info, unavailable) {
  let element = document.querySelector("#gpu-status");
  if (!element) {
    // In Dolly's element; a display-less embedding has none, and the indicator shows nowhere.
    element = (page.mount ?? document.createElement("div")).appendChild(document.createElement("div"));
    element.id = "gpu-status";
    element.className = "page-indicator";
    element.setAttribute("role", "status");
    element.style.cssText = "position:absolute;right:0.5rem;bottom:2rem;z-index:8;max-width:calc(100% - 1rem);" +
      "padding:0.15rem 0.45rem;background:var(--dolly-ui-background);border:1px solid;font-size:13px;pointer-events:none";
  }
  if (unavailable) {
    element.replaceChildren(`No GPU: ${unavailable}`);
    // The site's docs say how to enable WebGPU; another embedding has none.
    if (page.site) {
      const link = Object.assign(document.createElement("a"), { textContent: "How to enable WebGPU ↗",
        href: new URL("docs/gpu.md#enabling-webgpu", page.site).href, target: "_blank", rel: "noopener" });
      link.style.cssText = "color:var(--dolly-ui-accent);pointer-events:auto";
      element.append(" · ", link);
    }
    announce(page, element, "unavailable", "var(--dolly-ui-alert)");
    return {};
  }
  const adapter = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unnamed WebGPU adapter";
  // SwiftShader and llvmpipe are software adapters even where a browser does not flag them.
  const software = info.isFallbackAdapter || /swiftshader|llvmpipe/i.test(adapter);
  element.textContent = `${software ? "Software adapter, not a GPU" : "GPU"}: ${adapter} · ${info.f16 ? "" : "no "}shader-f16`;
  announce(page, element, software ? "software" : "hardware", software ? "var(--dolly-ui-accent)" : "var(--dolly-ui-quiet)");
  return { adapter, isFallbackAdapter: info.isFallbackAdapter };
}

export function browser(page) {
  const { mount } = page;
  let canvas, surface;
  if (mount) {
    canvas = document.createElement("canvas");
    canvas.id = "gpu-display";
    canvas.hidden = true;
    // Over the terminal: beside a smaller surface, its letterbox is the terminal's background, as
    // display@0's is.
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;" +
      "background:var(--dolly-ui-background)";
    mount.append(canvas);
    surface = canvas.transferControlToOffscreen();
  }
  let status = {};
  return {
    configuration: { canvas: surface }, transfers: surface ? [surface] : [],
    page: { get gpu() { return status; } },
    get surfaceSize() { return status.active ? { width: status.width, height: status.height } : undefined; },
    // The provider reports the adapter of each device it creates, or why it has none.
    messages: { "gpu-status"({ info, unavailable, ...message }) {
      if (info || unavailable) Object.assign(message, indicate(page, info, unavailable));
      status = { ...status, ...message };
      if (message.active) delete status.error;
      if (canvas && message.active !== undefined) canvas.hidden = !message.active;
      if (message.error) console.warn("Dolly GPU:", message.error);
    } },
    dispose() { canvas?.remove(); },
    // Disabled while the page goes on: a session without gpu@0 shows no adapter.
    disabled() {
      document.querySelector("#gpu-status")?.remove();
      page.indicators.hold("gpu", false);
    },
  };
}

export function worker({ send, configuration, get }) {
  let bridge, animation = 0;
  // This Worker's animation frames, counted while a program draws: the GPU Worker retires a
  // presented frame at one of them, so a surface goes at the display's rate. The page's would
  // make Chrome hold its pointer and wheel events for a frame; Chrome gives the GPU Worker,
  // nested in this one, none.
  const shown = configuration.canvas && new Int32Array(new SharedArrayBuffer(4));
  const count = () => { Atomics.add(shown, 0, 1); Atomics.notify(shown, 0); animation = requestAnimationFrame(count); };
  const counting = active => {
    if (shown && active && !animation) animation = requestAnimationFrame(count);
    if (shown && active === false) { cancelAnimationFrame(animation); animation = 0; }
  };
  return {
    bindings: { "env.dolly_gpu_dispatch": (address, bytes) => {
      if (!bridge) return -E.ENOSYS;
      return bridge.dispatch({ address, bytes });
    } },
    async start({ kernel, memory }) {
      bridge = await createGpuBridge(memory, Number(kernel.dolly_gpu_mailbox_address()), configuration.canvas, shown?.buffer,
        () => get("runtime").serviceDeferred(), status => { counting(status.active); send({ ...status, type: "gpu-status" }); });
    },
    dispose() { counting(false); bridge?.dispose(); bridge = null; },
  };
}
