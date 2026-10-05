# Publish the package index at a public URL that amy fetches and the home page links

- STATUS: OPEN
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
