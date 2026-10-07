import { toggleIndicators } from "./page-indicators.mjs";

// The page's own keys, taken before any host module or the guest reads them:
// F11 toggles fullscreen and Ctrl+Shift+F the page's indicators. Listening
// starts with the page, so they work while an image boots.
export function pageChords(keyboard) {
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      document.documentElement.dataset.fullscreen = "failed";
    }
  }

  // Ctrl+Shift+F, and the release of an F the page took.
  let indicatorsKeyDown = false;
  function indicatorsChord(event) {
    if (event.code !== "KeyF") return false;
    const taken = event.type === "keyup" ? indicatorsKeyDown
      : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
    indicatorsKeyDown = taken && event.type === "keydown";
    return taken;
  }

  function take(event) {
    const fullscreen = event.key === "F11";
    if (!fullscreen && !indicatorsChord(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown" && !event.repeat) fullscreen ? void toggleFullscreen() : toggleIndicators();
  }
  window.addEventListener("keydown", take, { capture: true });
  window.addEventListener("keyup", take, { capture: true });
  document.addEventListener("fullscreenchange", () => {
    document.documentElement.dataset.fullscreen = document.fullscreenElement ? "on" : "off";
    // Firefox lets focus leave a modal dialog once the page is fullscreen.
    if (!document.querySelector("dialog[open]")) keyboard.focus({ preventScroll: true });
  });
}
