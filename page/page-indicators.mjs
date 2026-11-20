// The page's own elements over the display's corners (class page-indicator:
// the GPU adapter, download offers, the microphone, the HTTP policy's
// refusals). They show when the page is ready and when one changes state, hide
// ten seconds later unless a state the user must not miss holds them, and
// Ctrl+Shift+F shows or hides them (page-chords.mjs). Only page code calls
// this; a guest reaches none of it.
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

// The column of a corner of boot()'s element (top-left, top-right, bottom-left,
// bottom-right) that the page's notes there go in: they stack and never overlap,
// and each has the look the page's style gives them all (browser.mjs, .page-corner).
export function indicatorCorner(mount, corner) {
  const found = [...mount.children].find(child => child.classList.contains("page-corner") && child.dataset.corner === corner);
  if (found) return found;
  const column = mount.appendChild(document.createElement("div"));
  column.className = "page-corner";
  column.dataset.corner = corner;
  return column;
}
