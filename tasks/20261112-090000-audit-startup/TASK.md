# Startup network audit: what an image start downloads, and what it does not need

- STATUS: OPEN
- PRIORITY: 440
- TAGS: audit,startup,network,performance

The owner's question: "is everything I see on the network tab in chrome inspector during
startup necessary? Does it download more stuff than it needs to launch?"

## State (2026-11-12)

Owner (2026-11-12): fix these after the modularity work (`20261112-074501-modules-modular`), before
the audit's other tasks.

Done on `fix/startup` (Chromium and Firefox: default, image, pack-store, snapshot-stream,
session-offline, session-times, custom-session, site, image-inventory, html, csp, amy, indicators,
threads; the source suite):
- Finding 1: packs are fetched ahead of the one being read, at most 8 and 64 MiB in flight, and
  handed over in order (`src/packaged-snapshot.mjs`); a kept pack fetched ahead and not read stays
  kept.
- Findings 3 and 6: a start checks only its own metadata against its catalog record
  (`loadImageMetadata`); no closure metadata and no recipe is fetched; `verifyVisibleRecipes` is
  gone (release acceptance checks the recipes). A saved session's restore loads no metadata
  (`restoresFilesystem`, asked of the modules before the kernel exists).
- Finding 4: the catalog records `recipesSha256`, a digest of the image's recipe records
  (`recipesDigest`, one line `SHA256 BYTES PATH` each), not the records: 2,135,123 B to 507,196 B
  (80 KB gzipped) for 217 images.
- Finding 5: routes and the menu use a Latin subset of the page font (34,160 B WOFF from the pinned
  fonttools), `font-display: swap`; the html@0 popup keeps the whole font, loaded when it opens.
- Finding 7: the release server sends each file with `no-cache` and its digest as ETag, and answers
  a matching `If-None-Match` with 304.
- Finding 8a: the build and custom-image code is imported only by the routes that build or run a
  custom image.
- Finding 9: the process files are fetched without `cache: "no-store"`.
- Finding 10: routes and the menu name `src/icon.svg` (a `data:` icon broke the strict policy).
- Finding 8b: a module's provider is imported when its module is attached or admitted, or, on a
  session route, asked to select the boot (`host/modules.mjs`): a nena image or a session page
  imports the providers it enables, not all 21.
- Found on the way: the parts-manifest peek read a cancelled clone, which cost the original its
  first bytes in Firefox up to 151 and in Node under the prefetch; it reads the body itself now
  (`20261112-011500-firefox-pack-start`, closed). The oldest Firefox measured since is 146.
- Finding 12, measured (pi-agent, release `a73ad906…` on 9045, Chrome 156 headless, third
  visit, V8 sampling): of the runtime Worker's 2,180 ms, `sha256_transform` in `dolly.wasm` took
  1,317 ms: the kernel hashed every byte twice, each part as it streamed and then the whole
  canonical image again at the end, about 360 MB/s. On `fix/batch` the Worker checks each part
  against its pack's digest with WebCrypto, and the kernel hashes nothing on this path
  (`abi/dolly-image-0.wat`): the canonical digest is only in the image's own metadata, so the
  second pass compared two fields of one file. Measured again on the batch round's build
  (2026-11-12 evening, Chrome, no added delay): a warm reload of pi-agent to ready, 2,050 ms on
  main's build, 900 ms on the round's; its first visit 10.4 s and 4.7 s.
- Finding 11, measured on release `0d27c879…` (9045) through a proxy that delays every response by
  50 ms, a fresh Chrome profile each run, `default`: 4,021, 4,028 and 4,391 ms to ready without
  preload links, 3,794, 3,809 and 4,122 ms with links to the 17 modules of `src/site.mjs`'s static
  graph (the proxy injected them). On `fix/batch` `generate-routes.mjs` writes those links into
  every route page (`{{DOLLY_PRELOAD}}` in `terminal.html`). The Worker's graph is its own
  module map, which a page's preload does not fill: Chrome 156 refuses `as="worker"` on a
  modulepreload link and Firefox ignores it, and both fetch the Worker's modules again.
- Found on the way, measured on `test/events` (`0a471165b`) through a proxy that holds every
  request 50 ms, `default`, a warm reload (packs in OPFS), Chrome 156: the host providers loaded
  one after another, on the page and again in the Worker, each with its own imports, about 900 ms
  a side. `createHost` now starts every provider its modules and their dependencies need before
  it attaches them in order (`host/modules.mjs`, `load`): 3,400 ms to ready with the preload
  links, 2,033 ms with this too; the first visit 17.2 s, 10.3 s.
- The page starts the runtime Worker once it has its route, before its host modules, and
  configures it when they are up (`src/browser.mjs`); the Worker waits for that message without
  the 10 s limit, which a rebuild's build exceeds. Same proxy, without preload links: Chrome
  2,281 to 2,100 ms, Firefox 2,299 to 2,184 ms; first visits 11.5 to 10.6 s and 12.4 to 11.1 s.
- The runtime Worker is one file, `dist/dolly-runtime-worker.mjs` (`scripts/bundle-process-worker.mjs`
  bundles `src/runtime-worker.mjs`), and the page's first message to it, `prepare`, names the image
  directory and the modules, so the catalog, the manifests and the providers load while the page
  starts its own (`hostRegistry`'s `load`). Same proxy, the batch round's build with its preload
  links: Chrome 1,833 to 1,684 ms, Firefox 1,717 ms; `prepare` alone 1,816 ms, since the Worker's
  6 import levels end about when the page configures it. On `fix/worker-bundle`.
Left: 2 (image contents, the owner's call per image).
Measured: release 0.1.6 as served on `127.0.0.1:9045` (release `a73ad906…`, 211 images,
catalog 2,056,929 B), Chrome 156, images default, pi-agent, bhop, neovim, python-data
(headless) and godot-lantern-drift, photocraft-photos (headed, Vulkan adapter). Every request
was counted on the wire by a logging reverse proxy in front of the server, so page, Worker and
service-worker traffic are all in the numbers. Nothing is fixed; this task holds the findings.

Answer: no, not everything is necessary, and yes, it downloads more than a launch needs.

- Packs are not over-fetched. A start fetches exactly the packs its own metadata lists, and
  every byte of them is a file of the image (sum of pack sizes = image size + 16 B a pack).
  No pack of the build closure is fetched. A second visit reads them from OPFS: 0 pack requests.
- Everything else is over-fetched. A start of default downloads 9.94 MB once-each; about 3.9 MB
  of that (39 %, counting the whole font) is not needed to launch it: the whole catalog (2.06 MB for a 6 KB record), the
  metadata and recipes of the 17 images it was built from (0.65 MB), a 1.07 MB page font, build
  code and host modules the page does not use. For the five large images the same overhead is
  6.6–7.5 MB in about 80–130 requests, 8–10 % of their bytes; for neovim 4.7 MB, 24 %.
- Where the server sends `no-store` (this local server, so every `npm` user of `serve.mjs`),
  the page and the Worker each download the code and the catalog: 2.3–2.5 MB twice on every
  start, and every reload downloads 7–11 MB again, session restores included.
- With the cache headers the Pages export writes, a second visit, a reload and a restore make
  5–8 requests (22–98 KB). That part is fine.
- A session restore loads no packs, as `docs/sessions.md` says, but it still loads the image's
  whole closure metadata and recipes and every host module.
- Time on a real network is dominated by packs fetched strictly one after another (36–142
  round trips), not by bytes of overhead.
- Not known: whether Cloudflare Pages compresses JSON and JavaScript under the
  `no-transform` the export sets. It decides whether the catalog costs 2.06 MB or about 0.1 MB.

## How it was measured

Scripts and raw logs: `/home/daug/dev/dolly-tmp/audit-fable-startup/` (`measure.mjs`,
`report.mjs`, `compress.mjs`, `contents.mjs`, `graph.mjs`, `depth.mjs`, `out/*.json`).
`node report.mjs out/default.local.json --full` prints every request with time, bytes,
`Sec-Fetch-Dest` and `Referer` (the importing module, so the initiator).

- `local`: the server's own headers (`cache-control: no-store` on everything, `scripts/serve.mjs:34`).
- `pages`: the proxy rewrites `cache-control` to what `scripts/export-cloudflare-pages.mjs:72-76`
  writes: `public, max-age=31536000, immutable, no-transform` for files, `no-store` for pages.
  This emulates the headers only: no compression, no parts, HTTP/1.1.
- Each run: fresh profile, first visit; browser restarted on the same profile, second visit;
  reload; `__dolly.saveSession("x")`; `/v0.1.6/session/?name=x`. "Ready" is
  `dataset.dollyStatus === "ready"`, timed from navigation; 5 s more were recorded after it.
- No request came after ready in any run (one exception, the service worker's update check, below).
- Localhost times are CPU, not network. Bytes are uncompressed bodies as this server sends them.
  "gz" columns are my own gzip -6 of the same files, an estimate of a compressing host.

## Totals

Wire requests / bytes / ms to ready.

| image | headers | first visit | second visit | reload | session restore |
| --- | --- | --- | --- | --- | --- |
| default | local | 295 / 12,444,642 / 469 | 259 / 7,086,381 / 405 | 258 / 7,086,372 / 292 | 258 / 7,086,371 / 225 |
| default | pages | 197 / 9,943,844 / 433 | 6 / 22,674 / 289 | 5 / 22,665 / 309 | 5 / 22,664 / 143 |
| pi-agent | local | 436 / 75,330,624 / 2742 | 315 / 11,224,854 / 2266 | 314 / 11,224,845 / 2249 | 314 / 11,224,843 / 717 |
| pi-agent | pages | 338 / 72,829,826 / 2561 | 6 / 22,675 / 2157 | 5 / 22,666 / 2086 | 5 / 22,664 / 613 |
| bhop | local | 393 / 74,563,205 / 2659 | 270 / 11,362,032 / 2264 | 269 / 11,362,023 / 2120 | 322 / 11,481,050 / 688 |
| bhop | pages | 327 / 72,124,983 / 2712 | 6 / 22,671 / 2270 | 5 / 22,662 / 2261 | 26 / 79,113 / 651 |
| neovim | local | 217 / 21,766,893 / 792 | 172 / 7,864,696 / 601 | 171 / 7,864,687 / 524 | 262 / 8,179,292 / 274 |
| python-data | local | 457 / 91,637,436 / 3505 | 315 / 10,614,949 / 2763 | 314 / 10,614,940 / 2685 | 314 / 10,614,935 / 765 |
| python-data | pages | 359 / 89,136,638 / 3132 | 8 / 98,151 / 2649 | 7 / 98,142 / 2568 | 7 / 98,137 / 734 |
| godot-lantern-drift | pages | 247 / 88,348,250 / 2715 | 6 / 22,686 / 2459 | 5 / 22,677 / 2626 | 36 / 153,801 / 668 |
| photocraft-photos | pages | 217 / 67,598,791 / 2191 | 6 / 22,684 / 1990 | 5 / 22,675 / 1887 | 36 / 144,528 / 715 |

default's shell prompt came 60–100 ms after ready in every case (569 ms on the first local visit).
The menu `/v0.1.6/`: 2 requests, 1,169,876 B, of which the font is 1,074,932 B (92 %).

## Case: first visit, empty storage

default, `pages` headers (each URL once). The `local` column is what the same start costs with
`no-store`, where the Worker fetches again what the page fetched.

| requests | n | bytes | gz est. | local n / bytes | asked by | launch needs it | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `default/` page | 1 | 567 | | same | navigation | yes | keep |
| `src/route.css` | 1 | 665 | | same | `terminal.html:8` | yes | keep |
| `/favicon.ico` | 1 | 9 (404) | | same | browser; no `rel=icon` in `terminal.html` | no | drop (finding 10) |
| `src/*.mjs` | 32 | 227,107 | (186 k for all `.mjs`) | 48 / 368,324 | `terminal.html:13` → `src/route.mjs:24` → `src/site.mjs:6-13`; Worker: `src/browser.mjs:167` | 18 of the page's 29 static files; the other 11 (69,374 B) serve builds and custom images only | split (finding 8) |
| `host/*/module.json` | 21 | 8,565 | 5 k | 42 / 17,130 | `host/manifests.mjs:9` (always all 21); Worker: `host/modules.mjs:16` | the image's own 9 | small; see finding 8 |
| `host/**/*.mjs` | 58 | 295,494 | | 114 / 588,822 | `host/modules.mjs:18`, for every module the page was given | the 9 declared modules; the other 12 are 24 files, 79,616 B | finding 8 |
| `dist/dolly-images.json` | 1 | 2,056,929 | 126 k | 2 / 4,113,858 | `src/images.mjs:10`, from `src/site.mjs:21`, `src/browser.mjs:144`, `src/worker-image.mjs:77` | one 6,452 B record, and the path/size list http@0 takes | shrink (finding 4) |
| `dist/IosevkaTerm-SemiBold.woff2` | 1 | 1,074,932 | same | same | `src/route.css:4`, `font-display: block` | no: boot log and html@0 popup text only | subset or defer (finding 5) |
| `dist/dolly-*-system-snapshot.json` | 18 | 596,139 | 94 k | same | `src/packaged-snapshot.mjs:69-75`, from `src/runtime-worker.mjs:12` | 1 file, 19,908 B | drop 17 (finding 3) |
| `Dollyfile*` recipes | 18 | 69,577 | 27 k | same | `src/packaged-snapshot.mjs:28-39`, from `src/runtime-worker.mjs:12` | no | drop from the start (finding 3) |
| `dist/dolly.wasm` | 1 | 232,742 | 87 k | same | `src/worker-image.mjs:88` | yes | keep |
| `dist/packs/*.snapshot.gz` | 36 | 5,358,261 | same | same | `src/packaged-snapshot.mjs:136-138,152-155`, one at a time | yes, all | keep; fetch ahead (finding 1) |
| `dist/dolly-process-worker.mjs`, `-process-0`, `-process-gate-0`, `-threads-0.wasm` | 4 | 22,098 | | same | `src/process-supervisor.mjs:210-220`, `cache: "no-store"` | yes (threads contract also without threads@0, 195 B) | keep; cacheable (finding 9) |
| other `dist/*.mjs` (build ids, ABI digests) | 4 | 759 | | 8 / 1,518 | static imports | yes | keep |
| total | 197 | 9,943,844 | 6.96 M | 295 / 12,444,642 | | | |

Other images, first visit, each URL once (`pages` headers; neovim from its `local` run without
the duplicates). "Own metadata" is the one file the start uses.

| image | packs n / bytes | metadata n / bytes (own) | recipes n / bytes | code, catalog, font, kernel | total |
| --- | --- | --- | --- | --- | --- |
| pi-agent | 121 / 64,105,770 | 46 / 4,648,038 (760,848) | 46 / 156,150 | 3,919,868 | 72,829,826 |
| bhop | 123 / 63,201,173 | 50 / 4,823,839 (761,360) | 50 / 236,556 | 3,863,415 | 72,124,983 |
| neovim | 45 / 13,902,197 | 19 / 1,602,038 (131,421) | 19 / 81,126 | 3,841,665 | 19,427,026 |
| python-data | 142 / 81,022,487 | 45 / 3,978,683 (615,896) | 45 / 140,124 | 3,995,344 | 89,136,638 |
| godot-lantern-drift | 62 / 80,098,300 | 45 / 4,192,130 (37,040) | 45 / 187,830 | 3,869,990 | 88,348,250 |
| photocraft-photos | 54 / 60,106,971 | 34 / 3,482,839 (180,990) | 34 / 129,720 | 3,879,261 | 67,598,791 |

The verdicts are those of default's table. dso@0 images (neovim, python-data) add
`dist/dolly-dso-0.wasm` and `dist/dolly-process-dso.mjs` (75,473 B, `host/dso/dso.mjs:11-15`).

Not fetched by any start, though they are in `dist/`: `dolly.data` (117,400,920 B, the compiler
seed: only `src/build-worker.mjs:127`, a rebuild route), the other 23 contract `.wasm` files,
`dolly-process-stack.mjs` unless the image declares stack@0, the menu, and
`coi-serviceworker.js` where the host sends the isolation headers. The release has no
`dist/dolly-seed.mjs`.

## Case: second visit (pack store in OPFS, HTTP cache)

`pages` headers, default: 6 requests, 22,674 B.

| request | bytes | verdict |
| --- | --- | --- |
| `default/` page | 567 | needed: pages are `no-store` by design (`export-cloudflare-pages.mjs:76`) |
| `/favicon.ico` | 9 (404) | drop; asked once per browser session |
| the 4 process files | 22,098 | refetched on every start: `cache: "no-store"` (finding 9) |

Packs: 0 requests; `src/pack-store.mjs:65-71` serves each from OPFS when its size matches, and
the kernel checks its digest again. Everything else comes from the HTTP cache. python-data: 8
requests, 98,151 B (the two dso files are `no-store` as well).

`local` headers: nothing is cached, so the start repeats the first visit less the packs:
259 requests / 7,086,381 B for default, 270–315 requests / 10.6–11.4 MB for the large images.
Of default's 7.09 MB: catalog twice 4.11 MB, font 1.07 MB, metadata 0.60 MB, code 0.98 MB (half
of it the Worker's second copy).

Ready takes 2.0–2.6 s for the large images with nothing to download. That is restore time,
not network (finding 12).

## Case: reload

Same as the second visit in both header sets, less the favicon: 5 requests / 22,665 B (`pages`),
258 requests / 7,086,372 B (`local`) for default.

## Case: session restore (`/v0.1.6/session/?name=x`)

| what | default | bhop | godot-lantern-drift | verdict |
| --- | --- | --- | --- | --- |
| requests / bytes, `pages` | 5 / 22,664 | 26 / 79,113 | 36 / 153,801 | the extra ones are the modules the image does not declare: a session route is given all 21 (`src/site.mjs:20-24`) |
| requests / bytes, `local` | 258 / 7,086,371 | 322 / 11,481,050 | not run | |
| packs | 0 | 0 | 0 | correct: `host/snapshot/snapshot.mjs:100` restores before `src/runtime-worker.mjs:23` reads a pack |
| closure metadata + recipes (`local`) | 36 / 665,716 B | 100 / 5,060,395 B | (90 / 4,379,960 B on a first visit) | not needed: fetched at `src/runtime-worker.mjs:12` before the restore; the save is the whole filesystem (finding 6) |
| catalog | 1 (2 on `local`) | same | same | used for `sessionCompatible` and the image's modules |

Ready: 143–875 ms; for the large images three to four times faster than their own second visit.

## Case: a host without the isolation headers (service worker)

default with COOP/COEP/CORP stripped by the proxy, `local` cache headers: 300 requests against 295.
`src/route.mjs:32-36` registers `coi-serviceworker.js` (1,410 B) and reloads once, which repeats
the page, `route.css` and `route.mjs` (3,622 B). Chrome's update check fetches the worker script
again about 2 s after each navigation (1,410 B), the only request seen after ready. Cost of the
path: 5 requests, 6.4 KB on the first visit, 1 request afterwards. Necessary there; not used on
the local server or under the Pages export, which send the headers
(`export-cloudflare-pages.mjs:72`).

## The Pages form (from the code, not measured)

- Files: `immutable` for a year, so the `pages` rows above apply to bytes over the wire, per
  URL once. Pages (`/vX/NAME/`) are `no-store`.
- A pack over 25 MiB is a manifest plus 20 MiB parts (`export-cloudflare-pages.mjs:32-49`). Of the
  measured images each has one: the compiler pack (25.4 MiB, 2 parts) in pi-agent, bhop and
  python-data; godot-editor (57.3 MiB, 3 parts); photocraft (27.9 MiB, 2 parts). That is one
  manifest of about 300 B and 2–3 part requests in place of one, fetched one after another, each
  part held whole and hashed in JavaScript (`src/static-asset.mjs:103-115`) before the kernel
  hashes the pack again. No extra payload. The OPFS store keeps the joined pack, so later visits
  ask for neither manifest nor parts.
- Every pack response is cloned to look for a manifest (`src/static-asset.mjs:67`), parts or not.
- `dolly.data` is Brotli-compressed or split; no start fetches it.

## Findings, ranked

1. **Packs are fetched one at a time: 36–142 serial round trips.** `src/packaged-snapshot.mjs:136-138`
   awaits each pack's download inside the loop that streams the previous one into the kernel.
   22 of default's 36 packs and 55 of bhop's 123 are under 4 KB. With 50 ms added to every request
   (HTTP/1.1, so module waves are overstated; the pack phase is not): default first visit 4,091 ms
   against 433 ms, of which packs 2,030 ms; bhop 10,914 ms against 2,712 ms, of which packs
   7,836 ms. Proposal: start the fetch of the next few packs while the current one streams and
   hand them to the kernel in the same order; per-pack verification and the store are unchanged.
   Expected at 50 ms: about 6–7 s less for bhop.

2. **Most first-visit bytes are image contents the first screen does not use; this is the recipes'
   choice, not the loader's.** The whole image is in Wasm memory before ENTRY runs, so every file
   costs download. Measured contents (`out/contents.txt`): godot-lantern-drift is 76.4 MiB of
   packs, of which `/usr/bin/godot-editor` is 57.3 MiB and is not started until the game quits;
   bhop, pi-agent and python-data each carry the 25.4 MiB compiler; photocraft-photos carries
   `photocraft-cli` (19.2 MiB) beside `photocraft` (27.9 MiB); every image carries 2.5 MiB of fonts,
   1.6 MiB of it `DroidSansFallback.ttf`. Proposal: an owner decision per image. A Lantern Drift
   route without the editor would be about 19 MiB.

3. **A start fetches the metadata and the recipe of every image in the build closure.**
   `loadPackagedSnapshotMetadata` (`src/packaged-snapshot.mjs:69-75`) imports 18–50 JSON files to
   compare one `sha256` of each (`:120-122`), and `verifyVisibleRecipes` (`:28-39`) downloads and
   hashes 18–50 recipes. Measured: default 596,139 B + 69,577 B where 19,908 B is used;
   godot-lantern-drift 4,192,130 B + 187,830 B where 37,040 B is used; bhop 4,823,839 B + 236,556 B.
   The closure includes build images (`go-sdk` 928,762 B, `zig-build`, `ghostty-build`). Release
   acceptance already checks the same inputs and recipes for every image
   (`scripts/site-release.mjs:92-122`). Proposal: check only the image's own metadata against the
   catalog at start; leave the chain and the visible recipes to acceptance (or record each
   image's snapshot `sha256` in the catalog, so one file proves the chain). Saves 0.65–5.0 MB and
   34–98 requests per first visit, and the same on every start under `no-store`.

4. **The catalog is 2,056,929 B and a start uses one record of it.** Loaded by the page and again
   by the Worker (`src/images.mjs:10`); 4,113,858 B per start under `no-store`. Its `recipes` field
   is 1,170,441 B: each of the 211 images repeats the full record of every recipe in its closure.
   The start needs its own record (6–17 KB), the closure's `artifacts` pins if finding 3 is not
   taken, and `bootstrapSources()` for http@0 (`src/browser.mjs:157`), which is paths and sizes.
   Proposal: store recipe records once and let images refer to them by digest (catalog about
   0.9 MB), or generate a per-image record beside the image's metadata and load the full catalog
   only on routes that build, list sessions or install packages. Parsing costs 1.7 ms; the cost
   is the bytes.

5. **The page font is 1,074,932 B on every route and the menu.** `src/route.css:4` and
   `index.html:11`. It styles the boot log and the html@0 popup; the terminal draws with the TTF
   inside the image. It is 11 % of default's first visit and 92 % of the menu's, and
   `font-display: block` hides the boot log text until it arrives. Proposal: a Latin subset for
   the page (tens of KB) and `font-display: swap`; the popup can keep the full file, fetched when
   a popup first opens (`host/html/html.mjs:141-146` already fetches it lazily).

6. **A session restore fetches the closure metadata and recipes it does not use.**
   `src/runtime-worker.mjs:12` runs before `restoreFilesystem` (`:23`); the manifest it writes in
   `prepare` (`:20`) is emptied with the rest of the filesystem. bhop: 100 requests, 5,060,395 B on
   each restore under `no-store`. Proposal: ask `host.restoreFilesystem` first, or load metadata
   inside the branch that streams packs. The route also loads all 21 modules (`src/site.mjs:23`):
   21–31 more requests than the image's own start.

7. **Under `no-store` the Worker downloads again what the page downloaded.** 66–98 URLs,
   2,339,292–2,500,798 B per start (catalog 2.06 MB, the rest code), and each reload repeats
   7–11 MB. `scripts/serve.mjs:34` sends `no-store` for everything because a candidate keeps its
   version while it changes. With the export's headers the duplicates are 0. Proposal: let
   `serve.mjs` send an `ETag` (it already hashes every file it serves) with `no-cache`, so a
   reload revalidates in place of downloading; findings 3 and 4 remove most of the rest.

8. **Code the page does not run.** (a) `src/site.mjs:10-13` statically imports the build and
   custom-image code on every route: 11 files, 69,374 B. Proposal: import them where `mode` is
   `rebuild` or the image is `custom`. (b) An image that declares nena@0 (default, pi-agent,
   python-data) and every session route get all 21 host modules on the page and in the Worker
   (`src/site.mjs:20-23`): 18–24 files, 58,037–79,616 B per side beyond the declared ones; 37
   files, 153,099 B for a restore of neovim. Proposal: import a provider when it is enabled;
   nena@0 needs the manifests to list modules, not the providers. (c) `host/manifests.mjs:9`
   imports all 21 `module.json` on every page: 21 requests, 8,565 B. Small.

9. **Seven files are `no-store` by the code, so they are downloaded on every start even with
   immutable headers.** `src/process-supervisor.mjs:215-217` (22,098 B),
   `host/dso/dso.mjs:12-14` (75,473 B), `host/stack/stack.mjs:9-11` (3,087 B). They are the only
   bytes of a second visit on Pages besides the page. Proposal: drop `cache: "no-store"`; the
   files are versioned with the release.

10. **`/favicon.ico` is a 404 on each first load of a browser session.** No route declares an
    icon. Proposal: `<link rel="icon" href="data:,">` in `terminal.html` and `index.html`.

11. **No preload: the page's import graph is 9 levels deep, the Worker's 7.** Each level is a
    round trip (`depth.mjs`); the catalog, the manifests and the providers follow in three more
    waves on each side. Not measured on a real network. Proposal, after findings 4 and 8:
    `modulepreload` links for the route's static graph in `terminal.html`, generated by
    `scripts/generate-routes.mjs`.

12. **Observation, not network: a start from stored packs takes 2.0–2.6 s where a session of the
    same files restores in about 0.4 s.** pi-agent, `local`, second visit: 1,970 ms between the kernel fetch
    and the first process, against 420 ms in the restore. Not profiled. It is the floor of every
    repeat visit of a large image.

## What launching needs, by this audit

The page, `route.css`, the route's own code (18 page files, the Worker's 25, the declared
modules' providers), the image's catalog record, its own metadata, `dolly.wasm`, its packs and
the process files. For default that is about 6.0 MB of the 9.94 MB fetched (5.36 MB packs);
for godot-lantern-drift about 80.9 MB of 88.3 MB.

## Not measured

- The public site. Whether Cloudflare Pages compresses `.json`, `.mjs` and `.wasm` responses that
  carry `no-transform` is unknown; `docs/deployment.md:186-190` says they are never precompressed.
  One look at the `content-encoding` of `/v0.1.6/dist/dolly-images.json` in the inspector settles it:
  with compression the catalog is about 60–130 KB and the closure metadata 90–590 KB, and
  findings 3 and 4 fall behind 5.
- Real latency and bandwidth, HTTP/2 or HTTP/3. The 50 ms runs are HTTP/1.1 through a local proxy.
- The parts form in a browser; reasoned from `src/static-asset.mjs` and the exporter.
- Whether the HTTP disk cache keeps a second copy of each pack beside the OPFS store
  (`cache: "force-cache"` with immutable headers suggests it does).
- Firefox and Safari; phones.
- Rebuild, custom-image and `sessions/` routes (the `sessions/` page was seen to load the catalog
  and the font: 19 requests, 3,194,968 B), `amy` installs, and anything after the first 5 s.
- The two GPU images were run with `pages` headers only, neovim with `local` only.
- Where the 2 s of a stored-pack start goes (finding 12).
