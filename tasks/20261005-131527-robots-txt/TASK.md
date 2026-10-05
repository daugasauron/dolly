# Serve /robots.txt that points to the source repository

- STATUS: OPEN
- PRIORITY: 200
- TAGS: site,docs

Owner (2026-10-05): "add a task to add /robots.txt file, linking to the gitrepo
source etc."

`robots.txt` is honoured only at a host root: daugasauron.com can serve it;
`daugasauron.github.io/dolly/robots.txt` is not consulted by crawlers.

## Work

Crawl rules that keep crawlers off the large binary assets, a `Sitemap:` line,
and comment lines naming the source repository and the licences page
(`20261005-131648-licences`). Agents are this project's audience: decide
whether an `llms.txt` earns its place and record the decision.

## Done when

- The local server and the static export serve it, and a test fetches it.

## Decisions (2026-10-05)

- `robots.txt` is a committed file at the checkout root. Packaging copies it
  into every release, `export-static.mjs` (and so the Cloudflare export) writes
  it at the public root like the HTML, `serve.mjs` serves it from the current
  release and the test server from the checkout.
- It disallows `/_dolly/` and `/dist/`. Measured layout of an export: every
  release file (code, recipes, docs, `dist/static` sources and their Cloudflare
  `.part-N` splits, `dist/dolly.data`) lives under `_dolly/RELEASE/`, packs
  under `dist/packs/`; only HTML, `coi-serviceworker.js`, `.nojekyll` and
  `robots.txt` sit at public paths. In a `default` export, `_dolly` is 320 MB,
  `dist` 53 MB and nothing else exceeds 1 MB. Pages, Dollyfile views and the
  licences page stay crawlable. Comment lines name the repository and the
  licences page.
- No `Sitemap:`. The front page links every page (image routes, views,
  licences, sessions, custom); image routes are script shells, and the docs
  exist only at release-pinned `_dolly/` URLs. A sitemap would be a second
  generated route list with no measured reader.
- No `llms.txt`. No agent client was measured requesting it; agents read the
  front and licences pages as plain HTML, the docs have no stable public URL
  to list, and the canonical docs are the GitHub repository that `robots.txt`
  names. Revisit when a client is seen asking for it.
- GitHub Pages serves the project site under `/dolly/`; crawlers only read
  `daugasauron.github.io/robots.txt`, which belongs to another repository. The
  shared packaging ships an inert `/dolly/robots.txt` there because excluding it
  would cost code.

## Evidence

- `node test/site-browser.mjs chromium`: passed. It fetches `/robots.txt`
  from the test server, checks `text/plain`, that a `_dolly` source, a pack and
  an unpinned `dist/static` path are disallowed and that `/`, `/licences/`,
  `/view/default/` and `/default/` are not.
- `DOLLY_BUILD_IMAGES=default bash scripts/package-pages.sh
  build/licences-evidence/releases daugasauron.com` sealed release `dc66eb0b…`;
  `DOLLY_PORT=9417 node scripts/serve.mjs build/licences-evidence/releases`
  answered `/robots.txt` 200 `text/plain`;
  `node scripts/export-static.mjs build/licences-evidence/releases/current
  build/licences-evidence/export` wrote `robots.txt` at the export root and in
  `deployment.sha256`.
