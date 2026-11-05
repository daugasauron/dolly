# v0.1.5 release candidate

- STATUS: OPEN
- PRIORITY: 400
- TAGS: release,0.1.5

Owner (2026-11-04 21:40): "Ok go ahead with your plan, I want to target 0.1.5. The exception is
lean, I absolutely want to include lean in 0.1.5." A candidate is local: nothing is pushed,
published or deployed until the owner says so (as for `tasks/20261029-230000-v014-rc`).

## State (2026-11-05, 21:40): candidate green; waits for the npm flow

Done on `integrate/2026-11-05`: steps 1 to 5. The candidate round (`work/round-1105-rc.sh`,
log `work/integrate/build/round-1105rc.log`) pinned the compiler llvm-cc links (`4149e5c4c`),
built every image, and reached the fixed point: llvm-cc built by that seed linked the same
compiler. The day's branches merged after it (janis ignores SIGPIPE, the header rules, the
plots, the tasks), and their 22 images rebuilt with the digests the branch's own build had.
Suites on `38b7254bb`: source 475, artifacts 26, the browser suites and the npm packages in
both browsers, every demo (Lean in both browsers), GPU stage green (local-llm's Firefox turn
hung once, rerun green: `tasks/20261105-173501-local-llm-turn`). Both sites packaged and
accepted; served locally (`test/pages-host.mjs`), v0.1.0 to v0.1.5 boot in both browsers,
`amy install lean` works from the served site in both (45 s, 62 s), the deployment has 93
header rules and 18,618 files, GitHub Pages 831 MB. Fixed on the way: acceptance in a profile
on disk (`b78a5be95`), the checklist's AWS key pattern (`7b353f851`).

Left: the owner's npm requirement of 2026-11-05 (`tasks/20261105-213000-npm-offline`, branch
`core/npm-offline`): an image and packages from npm served, built on with dolly-build and
packaged for a static host, with no request beyond the machine after `npm install`. The npm
packages are this release's, so after that branch merges: rebuild what it changes, then
`work/release-1105.sh` (packaging, the full catalog, `scripts/release-checklist.sh`), the
served boot and Lean checks again, and step 7.

## Scope (`tatr ls :0.1.5`)

- What `main` holds since v0.1.4 (576 commits at `ebffaaad8`, 2026-11-04) and the night round's
  thirteen branches on `integrate/2026-11-05` (`work/round-1105-night.sh`, a compiler round).
- Lean in `amy` (`tasks/20261027-232422-lean`): the owner's one requirement; its demo test in a
  6 GB tab in Chromium and Firefox, and the domain's catalog lists it.
- The catalog and metadata as JSON (`tasks/20261104-074513-catalog-json`): the npm packages'
  layout changes, so it goes with this version.
- Zig 0.17's `zig build` speed against 0.16's (`tasks/20261103-102041-zig017`).
- npm: the 13 packages at 0.1.5, and `dolly-package-git`, `-python` and `-cc` published for the
  first time (`tasks/20261104-074515-npm-publish`), the owner's step.

## Steps

1. The night round green: `main` takes `integrate/2026-11-05`.
2. The overnight branches merged (Lean, catalog JSON, Zig).
3. `DOLLY_VERSION` 0.1.5 (`src/version.mjs`, `package.json`, the npm packages); every recipe's
   site reference moves to `/v0.1.5/` (`node scripts/update-recipe-pins.mjs`), so every image
   rebuilds: the candidate round, with the suites, the demos and the GPU stage.
4. Before packaging: the domain's Cloudflare header rules. The Lean agent counted about 108 of
   the account's 100 for this release (Lean adds 5; the new compiler changes the bytes of every
   large binary, so their rules are new). Decide from the rule scheme in `docs/deployment.md`:
   fewer rules per file (one per directory or per content type) or older versions' rules retired;
   not a version dropped from the site. Done in `tasks/20261105-003331-pages-rules`: the page
   knows a split file's manifest by its content, so v0.1.5 adds 1 rule (93 of 100).
5. The domain's catalog lists `lean-std`, `lean-meta` and `lean` (`config/domain-pages-images.txt`), and
   `amy install lean` works from the domain's catalog on the served candidate.
6. The two sites packaged and checked (`scripts/release-checklist.sh`, `docs/deployment.md`), the
   candidate served locally and booted in Chromium and Firefox, as for v0.1.4.
7. The owner reviews; tag, push, publish and deploy on the owner's word.
