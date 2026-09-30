export default function (pi) {
  let welcomed = false;
  pi.on("session_start", (_event, context) => {
    if (context.mode !== "tui" || welcomed) return;
    welcomed = true;
    context.ui.notify([
      "Dollyfile Studio · /dolly-hello · /dolly-tool · /dolly-fix",
      "/model selects a local or remote model. The first local prompt loads Qwen.",
      "Ctrl+D leaves Pi; nvim /workspace/Dollyfile opens the editor.",
      "dollyfile-build /workspace/Dollyfile streams a test build; click Open image to run it.",
    ].join("\n"));
  });
}
