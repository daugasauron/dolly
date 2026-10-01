# Replace HOST with full URLs for every Dollyfile resource

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: dollyfile,design,syntax

Owner request (2026-10-01): remove the `HOST` keyword; every resource a recipe
names is a full URL, host included.

## Done when

- No recipe or tool uses `HOST`; every `FROM`, `COPY FROM`, `USE` and `SOURCE`
  names a full URL; `docs/dollyfile.md` describes it.
- The catalog built from the local server and from the published site gives the
  same image identities; pin, lint, graph and view tools handle full URLs.

## Proposal (Fable review, 2026-10-01)

- Syntax, with the digest right after every URL (today `SOURCE` is
  `location DEST SHA` but `USE` is `location SHA`):
  `FROM https://daugasauron.com/Dollyfile-system SHA`,
  `COPY FROM https://…/Dollyfile-codex-build SHA SRC DST`,
  `USE https://…/modules/search-tools.dm SHA`,
  `SOURCE https://…/static/codex/sources-00.part SHA DST`.
- Identity: recipes name one canonical published origin; identity stays the
  hash of recipe text plus SHA-256 pins, so a mirror changes nothing. The
  embedding maps the canonical origin to a mirror in the build policy, which is
  already trusted browser state: `npm run serve` maps it to localhost, a fresh
  clone serves unpublished files under the same mapping. The build policy
  becomes exactly the graph's pinned URLs (`20260930-232236-rebuild-network`).
  `join_host_url` and the `HOST-BASE` argument in `src/dollyfile.c` go away.
- Keep `REQUIRES HOST name@abi`: once resources drop `HOST`, the word means
  only browser host modules, matching `host/` and `DOLLY_HOST_REQUIRE`.

## Result (2026-10-01, branch `work/full-urls`)

Implemented as proposed; `docs/dollyfile.md` is the reference.

- `DOLLY 5`: `FROM URL SHA`, `COPY FROM URL SHA SRC DST`, `USE URL SHA`,
  `SOURCE URL SHA DST`. URLs are absolute http(s) with a host, no fragment,
  whitespace or `\`; FROM/COPY/USE URLs have no query and name
  `Dollyfile[-NAME]` or `NAME.dm` (any directory). Old syntax is rejected.
  `REQUIRES HOST name@abi` is unchanged. All 108 recipes and the generators
  (gpu-fluid, zero-ad, slopyard, Studio examples, display probe) migrated;
  `update-module-pins.mjs` recomputed the pins.
- The executor fetches URLs as named: `join_host_url`, the `HOST-BASE`
  argument and `/etc/dolly/host.base` are gone (`dollyfile RECIPE-URL|FILE:/path`).
- Mapping: `CANONICAL_ORIGIN` in `src/static-asset.mjs`. The page's HTTP policy
  (`host/http/policy.mjs`, trusted browser state built from the release
  registry) keys each published recipe and source by its canonical URL and the
  broker fetches it from `applicationBase` (the release directory: localhost
  for `npm run serve`, the test server and image builds; `_dolly/RELEASE/` on
  the site). Mirror URLs no longer grant the bootstrap capability; other
  canonical-origin URLs are ordinary destinations under the page policy.
- Tools key recipes by canonical URL (`recipe-files.mjs`, graph, pins, lint,
  registry, view pages, custom-recipe graph, artifact recipe lookup).

Implication for `20260930-232236-rebuild-network`: a build's whole input set
is now the URLs in its pinned graph. Canonical ones are already exact grants
mapped to the page's own release; a pinned-only build policy needs only the
graph's external `SOURCE` URLs as exact GET rules, as `build-snapshot-browser.mjs`
already does. Nothing in the mapping needs to change for that decision.

Evidence (image inputs `cb36b970…`):

- `npm run test:source`: 338 pass; 2 failures predate this change on
  `rebuild-batch` `e18a86b` (`images separate reusable runtimes…`,
  `retained images declare only their runtime providers`).
- Core chain and `gpu-fluid` (16 external `SOURCE` URLs from
  raw.githubusercontent.com) built with `npm run image`; `npm run test:artifacts`
  24 pass. `node test/browser-tests.mjs chromium firefox` passes except
  `audio` (audio-sdk not built) and `cpp` (a `--dolly-kernel-plugin` link with
  an undefined import succeeds; compiler behavior from `f3c6496`, untouched
  here), including core, image (C executor cases, custom rebuild),
  custom-session, boundary (canonical URL fetched as two mirror parts, mirror
  URL denied), site and image-inventory.
- Same checkout, different mirrors, same bytes: `system-tools` built on test
  server ports 29027, 31111 (cold profile, also rebuilding zig-build and
  ghostty-build in the page) and 31222 is `84b47ab8…` each time, with input
  ghostty-build `f272d9af…`. From a sealed release served by `npm run serve`
  (mirror `/_dolly/9f069c55…/`), `/system-tools/rebuild/` gives `84b47ab8…`
  in Chrome and Firefox and the root build `/system-build/rebuild/` gives
  `8a520dae…`, equal to the image build.

Remaining: the same check against the deployed daugasauron.com once a DOLLY 5
release is published; the Studio browser test (a 20-image closure) was not run.

## Closed (2026-10-01)

DOLLY 5 is live: daugasauron.com serves release `38b08a88…`, sealed from the
same snapshots the local candidate (`d1459402…`, 127.0.0.1:9001) serves, and
`site-release.mjs` verified each image's identity against its recipes when both
were sealed.
