export default function (pi) {
  let welcomed = false;
  pi.on("session_start", (_event, context) => {
    if (context.mode !== "tui" || welcomed) return;
    welcomed = true;
    context.ui.notify([
      "Dollyfile Studio · /dolly-hello · /dolly-tool · /dolly-fix",
      "Ctrl+Shift+L: load Qwen locally. /model selects a local or remote model.",
      "Ctrl+D leaves Pi; nvim /workspace/Dollyfile opens the editor.",
      "dollyfile-build /workspace/Dollyfile streams a test build; click Open image to run it.",
    ].join("\n"));
  });
}
