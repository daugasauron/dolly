// Dolly needs cross-origin isolation. Where the host sends no COOP and COEP
// headers, coi-serviceworker.js adds them: the page registers it and loads again
// under it, once; boot() says so if that did not isolate it.
if (!crossOriginIsolated && navigator.serviceWorker && !sessionStorage.getItem("dolly-isolation-retry")) {
  sessionStorage.setItem("dolly-isolation-retry", "1");
  await navigator.serviceWorker.register("./coi-serviceworker.js");
  await navigator.serviceWorker.ready;
  location.reload();
  await new Promise(() => {});
}
sessionStorage.removeItem("dolly-isolation-retry");
const { boot } = await import("./dolly/page/browser.mjs");
const { images, image, modules } = await import("./image/index.mjs");

// The hosts the agent may reach, and nothing else: the model's provider here,
// one rule per host the agent needs (api.github.com, pypi.org). A rule names an
// origin, its paths and methods, and the header that carries the key (docs/http.md
// in @daugasauron/dolly). Hosts without CORS headers go through a relay of your
// own (docs/agent-frontend.md).
const policy = { rules: [
  { origin: "https://openrouter.ai", pathPrefix: "/api/v1/", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
  // { origin: "https://api.anthropic.com", pathPrefix: "/v1/", methods: ["POST"], credentialHeaders: ["x-api-key"] },
] };

// The project and Pi's skills: workspace/ is written into /workspace and each
// skills/NAME/ (a SKILL.md and the files it names, Pi's docs/skills.md) into Pi's
// skills at each boot. dolly-build lists their files in workspace.json and skills.json
// beside this page. Pi's tools can read these files; they are not for secrets.
const files = {};
for (const [tree, directory] of [["workspace", "/workspace"], ["skills", "/home/dolly/.pi/agent/skills"]]) {
  const listing = await fetch(`./${tree}.json`);
  if (!listing.ok) throw new Error(`${tree}.json must list the files under ${tree}/, as dolly-build writes it`);
  await Promise.all((await listing.json()).map(async path => {
    const url = `./${tree}/${path.split("/").map(encodeURIComponent).join("/")}`;
    files[`${directory}/${path}`] = new Uint8Array(await (await fetch(url)).arrayBuffer());
  }));
}
// The sandbox's colours, all in theme.json: Pi's theme (Pi's docs/themes.md), written
// over the image's, whose background, text, accent and muted the terminal and the
// popups take too (docs/embedding.md in @daugasauron/dolly).
const theme = await (await fetch("./theme.json")).text();
files["/home/dolly/.pi/agent/themes/dolly.json"] = theme;
const { vars } = JSON.parse(theme), look = document.querySelector("#dolly").style;
look.setProperty("--dolly-background", vars.background);
look.setProperty("--dolly-color", vars.text);
look.setProperty("--dolly-accent", vars.accent);
look.setProperty("--dolly-display-palette-8", vars.muted);

// Save (Ctrl+Shift+S) keeps the sandbox's state in this browser and names it in the
// address, ?session=NAME: the page then opens that save, as it was, in place of a fresh start.
const session = new URLSearchParams(location.search).get("session") ?? undefined;
await boot(document.querySelector("#dolly"), { images, image, modules, http: { policy }, files, session });
