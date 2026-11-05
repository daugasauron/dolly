# Pages headers for every published version within Cloudflare's 100 rules

- STATUS: CLOSED
- PRIORITY: 380
- TAGS: release,deployment,0.1.5

Step 4 of `tasks/20261104-124209-v015-rc`. Cloudflare Pages takes 100 `_headers` rules. The
exporter (`scripts/export-cloudflare-pages.mjs`) wrote one for each large file a version stores
differently: `Content-Encoding: br` for a file over 25 MiB that compresses below it, and
`X-Dolly-Parts: 1` for a file in parts (its path holds the manifest, `PATH.part-N` the parts). One
rule covers a path in every version that stores it the same way. Every published version stays on
the site (`docs/deployment.md`), and v0.1.0 to v0.1.4 must keep working: their pages are fixed and
read `X-Dolly-Parts`.

## Measured, 2026-11-05

The exporter's `pagesHeaders` on the archive (`work/locks/published`, read only) plus a v0.1.5
domain site as `exportVersion` would write it (`build/pages-rules-evidence/`): the domain catalog's
closure in this tree (196 images, 2,292 packs, 333 static sources), every file over 25 MiB put
through `pagesAsset`. The packs are the confirming round's (seed 88959af6); the candidate's differ
in bytes, not in which are large. The seed `dist/dolly.data` is the candidate's.

| Versions | Rules before | Rules after |
| --- | --- | --- |
| v0.1.0 to v0.1.4 | 92 | 92 (the same `_headers`, byte for byte) |
| v0.1.0 to v0.1.5 | 107 | 93 |

- v0.1.5 has 18 packs and 31 sources over 25 MiB that do not compress below it (in parts), and 5
  compressed files (`dist/dolly.data` at 23.2 MB, `default/zig.tar`, `llama/source.tar`,
  `speech/source.tar`, `zero-ad-data/tools.tar`). Alone it needed 56 rules.
- After: its 5 compressed files are stored as the older versions store them, so their
  `/:version/` rules cover it; its files in parts need none. The one new rule:
  `zig-llvm/zig.tar` (247 MB) was compressed in v0.1.3 and v0.1.4 and is in parts in v0.1.5, so
  its rule names those two versions.
- Files: the archive is 14,037; v0.1.5 about 4,700 (2,292 packs and 396 of their parts, 333
  sources and 526 of their parts, about 1,150 pages, code and documents). About 18,750 of 20,000:
  v0.1.6 will not fit beside all five older versions as they are stored now.

## Decision

A page since v0.1.5 knows a manifest by its content: a manifest is JSON that begins with
`{"byteLength":` (`PARTS_MANIFEST_START` in `src/static-asset.mjs`), and `pagesAsset` refuses a
file that begins so. `decodeStaticAsset` reads the first bytes from a copy of the response and
ignores `X-Dolly-Parts`. A version's `deployment.headers` names only its compressed files; when
the root `_headers` is assembled, a version holding `PATH.part-0` stores PATH in parts, as an
older version's `X-Dolly-Parts` rule says, so that rule stays one rule for all of them (the
header is true and harmless for the newer page).

- Why content and not a header or a name: the manifest is the description of the file, so a
  second description (a header rule, a redirect, a list) is what runs out. Recipe URLs are fixed
  (`/vX.Y.Z/dist/...`), so no pattern rule can single out the split files, and pack names are
  hashes. The manifest only names fixed `.part-N` siblings, and only site sources, pinned packs
  and clicked source links are decoded, so no authority changes.
- Compressed files keep their rules: the browser decodes Brotli only by `Content-Encoding`, and
  storing them in parts instead would download a 247 MB `zig.tar` instead of 8 MB and split the
  older versions' shared rules.
- Old versions' rules are not changed: their pages need them. Placeholder rules that the exporter
  proves exact (`codex/sources-:n.part`, `llm/:model/:n.part`) would merge some of their 86, but
  each is a rule a reviewer must check against the file lists; not needed for v0.1.5.
- Not image inputs: page JavaScript and scripts. `npm run build:runtime` prints image inputs
  `b9e16e76`, the candidate round's.

## Closed, 2026-11-05

Commits `7da9b05e6` (the scheme, its tests and `docs/deployment.md`) and `0369484ad` (release
step 6 boots every version from the assembled deployment before the upload). Verified on a v0.1.5
domain site packaged from this tree with `default`'s closure (19 images, built with image inputs
`b9e16e76`; evidence in `build/pages-rules-evidence/`):

- `site-release.mjs verify` passes. `export-cloudflare-pages.mjs` of the archive and that site:
  14,652 files, 92 rules; v0.1.5's `deployment.headers` names `dist/dolly.data` and
  `default/zig.tar`, both covered by the older versions' `/:version/` rules; its one pack in parts
  (26.6 MB, 2 parts) has no rule. The archive is unchanged (every file checked against its list
  by the export; nothing in it is newer than this task).
- Served by `test/pages-host.mjs`: `published-version.mjs verify` passes, and
  `published-version.mjs boot` boots `default` of v0.1.0, v0.1.1, v0.1.2, v0.1.3, v0.1.4 and
  v0.1.5 in Chromium and Firefox. In both browsers v0.1.5's page reassembles that pack from its
  parts with no `X-Dolly-Parts` header, to the release's bytes.
- `test/boundary-browser.mjs` (a source in parts through the HTTP broker, served without the
  header) passes in Chromium and Firefox; the source suite passes (475).
- The whole domain catalog of the candidate is counted by the synthetic measurement above (93);
  the release checklist's step 6 exports it and prints `headerRules`, and boots every version
  from it before the upload.

Next limit: files, `tasks/20261105-005808-pages-files`.

## Lessons

- Count before choosing: the old versions' 86 file rules are fixed by their pages, so only what
  a new version adds could move, and that was 15 of the 107. The scheme followed from that.
- A rule shared by versions breaks when one version stores the path differently, so the new
  scheme had to keep the older storage decisions and treat a newer manifest as matching the old
  parts rule; dropping the new version's rules without that splits the shared rules per version
  (measured: 183 rules).
- `Response.clone()` has a trap: cancelling one branch of a tee settles only when the other is
  read or cancelled too. Awaiting it hung the unit tests; the cancel is fired and not awaited.
- The task's estimate (about 108) was 107 measured: a synthetic version entry from the catalog's
  metadata and `pagesAsset` answers this kind of question in minutes, without the full package.
