# Pages headers for every published version within Cloudflare's 100 rules

- STATUS: OPEN
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

## State, 2026-11-05

Implemented; verification below.
