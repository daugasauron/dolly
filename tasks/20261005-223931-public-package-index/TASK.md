# Publish the package index at a public URL that amy fetches and the home page links

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: packages,amy,site,boundary

Owner request (2026-10-06): "I want the index to live outside the userspace,
so amy calls something like daugasauron.com/amy-index.txt to get it (ok to
cache). Also I want it to be linked from the homepage."

## Today (main `15aefe12`)

- The index is `dist/dolly-packages.txt`, written by
  `scripts/generate-routes.mjs` (one `NAME URL SHA256` line per `PACKAGE`
  recipe) and published only under the release's hashed path,
  `_dolly/RELEASE/dist/dolly-packages.txt`. No public page links it.
- amy never fetches a site URL: it asks the page's `packages@0` service
  (`https://packages.dolly.invalid/v1/index`, `host/packages/service.mjs`),
  which reads the running release's copy. `GET /v1/packages/SHA256` then
  serves a package's verified snapshot the same way.

## Work

- Publish the index as a plain file at a stable path on the site (working
  name `/amy-index.txt`), readable in a browser and linked from the start
  page next to the package list. amy fetches that URL through the HTTP
  broker like any other request; caching is allowed, so say for how long and
  what `amy` does when offline.
- Decide and record what the service keeps. The snapshot delivery still needs
  trusted code that verifies published packs; the index no longer does.
- Release coherence: a stable URL describes the newest release, while an open
  tab runs the one it loaded. An index row whose package was built for another
  image build must fail by name ("this tab runs an older release; reload"),
  never install mismatched files.
- The broker's grant: running images may GET exactly that path on their own
  site; update `docs/browser-boundary.md` and `docs/http.md`. GitHub Pages
  serves under a prefix, so the path is relative to the site, not the host.
- The line format gains the description from
  `20261005-220754-amy-descriptions`; keep one format for both tasks.

## Done when

- `curl SITE/amy-index.txt` returns the index, the start page links it, and
  `amy list` and `amy install` work from it in Chrome and Firefox on the local
  server, with the stale-release case covered by a test.
- `docs/dollyfile.md` ("Packages and amy") and the boundary documents say
  only what exists.

Changes `/bin/amy` (seed): batch with the next rebuild round.

## Result (2026-10-06, `work/amy-index`)

- The index is `amy-index.txt` at the site's root: `NAME URL SHA256
  DESCRIPTION` per package, written by `scripts/generate-routes.mjs` from the
  recipes and their README lines, never by hand. The start page links it
  ("Package index"). A release holds it; the release server and the static
  export also serve it at the stable path, as they do `robots.txt`.
  `dist/dolly-packages.txt` is gone.
- `amy` asks for the path `/amy-index.txt`. The broker resolves a path
  against the root of the site serving the release (`publicURL`, so also
  under a path prefix; never above the root) and the policy judges the result
  like any URL. No domain is written in `amy`; this is the form the owner
  leans to in `20261005-223931-origin-not-hardcoded`, for its first reference.
  The rows still name recipes by their canonical URL: that is the recipe's
  identity, which the engine checks against the package's receipt, not a
  place `amy` fetches. It changes with the recipes, in that task.
- Policy: no new grant. Without a policy object (the public site, local
  release candidates) the default admits the site's own origin; a restricted
  page adds `{ origin, path: "/amy-index.txt" }` (`docs/http.md`,
  `docs/browser-boundary.md`). The program is told the path it asked for,
  not where the site is served.
- The stable URL describes the newest release, as asked, not the release the
  tab runs. Nothing mismatched can install: `packages@0` serves only the
  pins of the tab's own release, so a newer row is a 404 that `amy` reports
  by name ("the site has a newer release than this tab runs; reload the
  page"), and the engine checks the receipt as before.
- `packages@0` keeps what needs trusted code: `GET /v1/packages/SHA256`, the
  verified snapshot. `/v1/index` is removed.
- Cache: `amy` keeps no copy; the site's cache headers decide, and Dolly's
  servers and the Pages export send `no-store` for stable paths, so each
  `amy list` reads the current index. Without the site, `amy list`, `info`
  and `install` fail naming the index; `amy installed` and `amy files` of an
  installed package need no network.
- Not the seed: `amy.c` is a pinned `SOURCE` of `system-tools`, and the page
  code is not in any image. `image inputs` stays `047fc328…`; images from
  `system-tools` down rebuild, the toolchains before it are reused.

Evidence (rebuilt `default`, `python`, `minimal`, `cc`, `core`, `amy`;
runtime `5439ebe7…`):

- `test/amy-browser.mjs` (blocks `amy`, `amy cc`, `amy refusal`) passes in
  Chrome and Firefox under an explicit policy with the one rule: list, info,
  install, a stale index row (fails by name, installs nothing), the service
  refusing `/v1/index`. Its `amy programs` block needs `cmake`, `sdl2`,
  `rust` and `codex-cli`, which were not built here.
- `test/http-broker.test.mjs`: a path resolves under the site's root, not
  above it or to another host, and only where the policy admits it; without
  a site it names nothing.
- `test/site-browser.mjs` (both browsers): the start page's link returns the
  index, and under a `/pages` prefix `amy list` reads `/pages/amy-index.txt`
  with no unprefixed request.
- A scratch `npm run publish` of `default,python` served by
  `scripts/serve.mjs` on port 9117: `curl /amy-index.txt` is 200
  `text/plain` `no-store`, the start page has the link, and in Chrome and
  Firefox the page (assets under `_dolly/RELEASE/`) lists and installs
  `python` (`build/userspace2-evidence/probe-release.log`).
