export default function (pi) {
  pi.on("session_start", (_event, context) => {
    if (context.mode !== "tui") return;
    context.ui.setWidget("dollyfile-studio", [
      "Dollyfile Studio · /dolly-hello · /dolly-tool · /dolly-fix",
      "Ctrl+Shift+L: load Qwen locally. /model selects a local or remote model.",
      "Ctrl+D leaves Pi; nvim /workspace/Dollyfile opens the editor.",
    ]);
  });
}
