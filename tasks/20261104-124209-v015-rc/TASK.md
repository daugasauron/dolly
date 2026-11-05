# v0.1.5 release candidate

- STATUS: OPEN
- PRIORITY: 400
- TAGS: release,0.1.5

Owner (2026-11-04 21:40): "Ok go ahead with your plan, I want to target 0.1.5. The exception is
lean, I absolutely want to include lean in 0.1.5." A candidate is local: nothing is pushed,
published or deployed until the owner says so (as for `tasks/20261029-230000-v014-rc`).

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
   not a version dropped from the site.
5. The domain's catalog lists `lean-std`, `lean-meta` and `lean` (`config/domain-pages-images.txt`), and
   `amy install lean` works from the domain's catalog on the served candidate.
6. The two sites packaged and checked (`scripts/release-checklist.sh`, `docs/deployment.md`), the
   candidate served locally and booted in Chromium and Firefox, as for v0.1.4.
7. The owner reviews; tag, push, publish and deploy on the owner's word.
