# Pages' 20,000 files for v0.1.6 beside every published version

- STATUS: OPEN
- PRIORITY: 300
- TAGS: release,deployment

Cloudflare Pages takes 20,000 files a deployment, and every published version stays on the site
(`docs/deployment.md`). Found while fitting v0.1.5's header rules
(`tasks/20261105-003331-pages-rules`).

## Measured, 2026-11-05

- The archive (`work/locks/published`, v0.1.0 to v0.1.4) is 14,042 files with each version's
  `deployment.sha256`. A v0.1.5 domain site is about 4,700 (2,292 packs and 396 of their parts,
  333 sources and 526 of their parts, about 1,150 pages, code and documents): about 18,750 in
  all. Another version of that size makes about 23,500, so v0.1.6 cannot be deployed beside all
  six as they are stored now, and the exporter will refuse it.
- Packs are most of it and repeat: the archive holds 6,429 pack files (with parts) at 3,064
  distinct paths, and 657 of v0.1.5's 2,292 packs are already in an older version, by hash.

## State, 2026-11-05

Open. A lever to measure: since v0.1.5 a page knows a split pack's manifest by its content, so a
pack needs no header rule wherever it is served; a version from v0.1.6 could read its packs from
one store the versions share (a `_redirects` rewrite of its `dist/packs/` costs one of 100
dynamic redirects, or the page's pack base), which counts each pack once. Versions now share
nothing by design (`docs/deployment.md`), so this changes that rule for packs, which are
content-addressed. Done when v0.1.0 to v0.1.6 export within 20,000 files and boot from a
locally served deployment.
