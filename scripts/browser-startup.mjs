export function waitForDebugger(chrome) {
  return new Promise((resolve, reject) => {
    let diagnostics = "";
    function finish(error, port) {
      clearTimeout(timer);
      chrome.stderr.removeListener("data", onData);
      chrome.removeListener("exit", onExit);
      chrome.removeListener("error", onError);
      if (error) reject(error);
      else resolve(port);
    }
    function onData(bytes) {
      diagnostics = (diagnostics + bytes.toString()).slice(-8000);
      const match = diagnostics.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) finish(null, Number(match[1]));
    }
    const onExit = (code, signal) => finish(new Error(`Chrome exited (${signal ?? code}) before opening its debugging endpoint`));
    const onError = error => finish(error);
    const timer = setTimeout(() => finish(new Error("timed out waiting for Chrome debugging endpoint")), 10_000);
    chrome.stderr.on("data", onData);
    chrome.once("exit", onExit);
    chrome.once("error", onError);
    if (chrome.exitCode !== null || chrome.signalCode !== null) onExit(chrome.exitCode, chrome.signalCode);
  });
}
