// The page's own elements over the display's corners (class page-indicator:
// the GPU adapter, the session Save button, download offers). They show when
// the page is ready and when one changes state, hide ten seconds later unless
// a state the user must not miss holds them, and Ctrl+Shift+F shows or hides
// them (page-chords.mjs). Only page code calls this; a guest reaches none of
// it.
const holders = new Set();
let timer;
const set = shown => { document.documentElement.dataset.indicators = shown ? "shown" : "hidden"; };

export function showIndicators() {
  clearTimeout(timer);
  set(true);
  timer = setTimeout(() => { if (!holders.size) set(false); }, 10_000);
}

// Holding shows them until the holder lets go, then for ten more seconds.
export function holdIndicators(holder, held) {
  if (held) holders.add(holder);
  else if (!holders.delete(holder)) return;
  showIndicators();
}

export function toggleIndicators() {
  clearTimeout(timer);
  set(document.documentElement.dataset.indicators === "hidden");
}

// What the image's programs draw and compute with, over the display's bottom
// right corner: gpu@0 names the adapter it gives them (host/gpu/gpu.mjs); a
// page whose image has no gpu@0 says that everything is done on the CPU.
// Guest frames cannot draw, cover or remove it, and only a link in it takes
// clicks.
export function gpuIndicator() {
  let element = document.querySelector("#gpu-status");
  if (!element) {
    element = document.body.appendChild(document.createElement("div"));
    element.id = "gpu-status";
    element.className = "page-indicator";
    element.setAttribute("role", "status");
    element.style.cssText = "position:fixed;right:0.5rem;bottom:2rem;z-index:8;max-width:calc(100vw - 1rem);" +
      "padding:0.15rem 0.45rem;background:#262626;border:1px solid #77736c;font-size:13px;pointer-events:none";
  }
  return element;
}

export function indicateNoGpu() {
  const element = gpuIndicator();
  element.dataset.gpu = "absent";
  element.textContent = "CPU: this image has no GPU module";
}
