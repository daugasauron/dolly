# v0.1.5 release candidate

- STATUS: OPEN
- PRIORITY: 400
- TAGS: release,0.1.5

Owner (2026-11-04 21:40): "Ok go ahead with your plan, I want to target 0.1.5. The exception is
lean, I absolutely want to include lean in 0.1.5." A candidate is local: nothing is pushed,
published or deployed until the owner says so (as for `tasks/20261029-230000-v014-rc`).

## State (2026-11-06, 03:40): deployed and verified; the owner's tag and GitHub release left

v0.1.5 is `15929916a`, deployed on the owner's word (2026-11-05: "I want something deployed
tomorrow morning that I can verify") to the Cloudflare project `dolly`, which serves
slopshare.dev and daugasauron.com; GitHub Pages is no longer deployed (`7e2d338c5`). The last
round (`work/round-1105-rc3.sh`, evidence `work/integrate/build/round-1105rc-evidence/`): 14
images rebuilt with unchanged pins; source 472, artifacts 26, browser and npm suites in both
browsers; 35 of 36 demos and every GPU test but one. The two failures were hangs, each passing
twice on rerun and since found and fixed on `fix/hangs-1105` for 0.1.6: tmux's first cc in
Firefox (the cycle collector ended the Worker compiling it) and slopyard's upload in Chrome (the
collector took the file's reader mid-read; `tasks/20261104-213210-slopyard-hang`). Packaged and
checked by `scripts/release-checklist.sh`: 18,615 files, 93 header rules; served locally,
v0.1.0 to v0.1.5 boot in both browsers and `amy install lean` proves from the served site (45 s,
68 s). Deployed 00:50 to 01:07 (wrangler uploaded only new files). Live: every file of v0.1.5
and every version's list on slopshare.dev; v0.1.0 to v0.1.5 boot in both browsers on both
domains, once the check read robots.txt by its groups (`60d1ed5b8`: daugasauron.com's zone
adds Cloudflare's managed robots.txt); `amy install lean` proves from slopshare.dev (138 s, 154 s).
v0.1.5 is archived in `work/locks/published`; its list's SHA-256 is
`9b18b2454dd46372de6d32d506fb24fba2049f615722ff8302831feb24397b96`.

Left, the owner's: `git tag -a v0.1.5 -m "Dolly 0.1.5" 15929916a`, `git push origin main v0.1.5`,
`gh release create v0.1.5 .cache/dolly-seed-compiler-0ceba5af9bed3f258fd0c635f3ad5f21c813b6ccb8eef7e236169428a74a4d3d.tar
--verify-tag --notes-file NOTES` (`DOLLY_SEED_COMPILER_URL` names that asset). npm stays at 0.1.4's packages: the owner's
requirement of 2026-11-05 (`core/npm-offline`, no request beyond the machine after `npm
install`) goes with 0.1.6, whose candidate also moves the version and every recipe's site
references, as `69930dc2f` did for this one. Not on the site: python-data, ffmpeg and openblas
(`tasks/20261105-181900-domain-catalog`).

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
