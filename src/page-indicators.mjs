// The page's own elements over the display's corners (class page-indicator:
// the GPU adapter, the session Save button, download offers). They show when
// the page is ready and when one changes state, hide ten seconds later unless
// a state the user must not miss holds them, and Ctrl+Shift+F shows or hides
// them (host/display/input.mjs). Only page code calls this; a guest reaches
// none of it.
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
