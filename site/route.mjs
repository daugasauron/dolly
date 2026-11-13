// A route of the site, the page terminal.html makes for an image (scripts/generate-routes.mjs).
// It has no inline script or style, so a site's Content-Security-Policy needs no
// 'unsafe-inline'; its main element names the image, how it opens and whether it opens the
// saved session, and may name fewer host modules than the route's (data-modules, names
// separated by spaces) and an HTTP policy and relays other than the site's
// (data-http-policy, data-http-relays: JSON, as boot() takes them; docs/http.md).
const assets = new URL("../", import.meta.url);
const terminal = document.querySelector("#terminal");
// The popup's font file, as a URL a route under any path resolves alike.
terminal.style.setProperty("--dolly-html-font-file", `url("${new URL("dist/IosevkaTerm-SemiBold.woff2", assets)}")`);
const failed = text => {
  terminal.firstElementChild.textContent = `FATAL\n${text}\n`;
  document.documentElement.dataset.dollyStatus = "failed";
};
if (crossOriginIsolated) {
  sessionStorage.removeItem("dolly-isolation-retry");
  // The site is an embedding: its route names the host modules it uses (site/site.mjs).
  const { image, mode, loadSession, modules, httpPolicy, httpRelays } = terminal.dataset;
  const json = text => text === undefined ? undefined : JSON.parse(text);
  let bootRoute, options;
  try {
    options = { image, mode, loadSession: loadSession === "true", images: assets.href, site: assets.href,
      named: modules?.split(" "), http: { policy: json(httpPolicy), relays: json(httpRelays) } };
    ({ bootRoute } = await import("./site.mjs"));
  } catch (error) {
    failed(`Dolly failed to load.\n${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
  // The route shows its own failure in the terminal.
  if (bootRoute) window.__dolly = await bootRoute(terminal, options).catch(error => console.error(error));
} else if ("serviceWorker" in navigator) {
  await navigator.serviceWorker.register(new URL("coi-serviceworker.js", assets), { scope: assets.pathname });
  if (!navigator.serviceWorker.controller) {
    await navigator.serviceWorker.ready;
    location.reload();
  } else if (sessionStorage.getItem("dolly-isolation-retry") !== "1") {
    sessionStorage.setItem("dolly-isolation-retry", "1");
    location.reload();
  } else {
    failed("Dolly could not establish cross-origin isolation.");
  }
} else {
  failed("Dolly requires cross-origin isolation and service workers are unavailable.");
}
