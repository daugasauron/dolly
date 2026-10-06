// The page's own keys, taken before any host module or the guest reads them:
// F11 toggles fullscreen. Listening starts with the page, so it works while
// an image boots.
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

  function take(event) {
    if (event.key !== "F11") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown" && !event.repeat) void toggleFullscreen();
  }
  window.addEventListener("keydown", take, { capture: true });
  window.addEventListener("keyup", take, { capture: true });
  document.addEventListener("fullscreenchange", () => {
    document.documentElement.dataset.fullscreen = document.fullscreenElement ? "on" : "off";
    // Firefox lets focus leave a modal dialog once the page is fullscreen.
    if (!document.querySelector("dialog[open]")) keyboard.focus({ preventScroll: true });
  });
}
