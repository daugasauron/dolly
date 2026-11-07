# v0.1.5 release candidate

- STATUS: CLOSED
- PRIORITY: 400
- TAGS: release,0.1.5

Owner (2026-11-04 21:40): "Ok go ahead with your plan, I want to target 0.1.5. The exception is
lean, I absolutely want to include lean in 0.1.5." A candidate is local: nothing is pushed,
published or deployed until the owner says so (as for `tasks/20261029-230000-v014-rc`).

## State (2026-11-07): v0.1.5 released

The owner (2026-11-07): "go ahead with the 0.1.5 release commit, tag, push everything". v0.1.5 is
rc.0's commit, `fcfe756f1`, which the deployed /v0.1.5/ names (`release/source.commit`): tag
`v0.1.5` (annotated, "Dolly 0.1.5") pushed; the GitHub release "Dolly v0.1.5" (latest) holds the
seed compiler, and `DOLLY_SEED_COMPILER_URL` serves its pinned SHA-256; its notes are
`work/integrate/build/NOTES-v0.1.5.md`. npm: the 25 packages at 0.1.5, packed from `fcfe756f1`
(`work/release-npm-1107.sh`), are rc.0's but for the version, passed `test/npm-browser.mjs`
offline as tarballs in Chromium (123 s) and Firefox (94 s), and are published under `latest`,
each registry integrity the tested tarball's (`work/release-publish-1107.sh`). `main` adds
`demos/pi/data-pi` on 0.1.5 from the registry, built in a rootless container from Playwright's
image with the build itself offline.

## State (2026-11-06, 10:30): v0.1.5-rc.0 deployed, tagged, pushed and on npm

The owner (2026-11-06 07:00), on the npm flow left for 0.1.6: "That SHOULD be a part of 0.1.5",
"give me a 0.1.5-rc tag thats deployed and pushed", and "You publish when green". The npm flow
(`tasks/20261105-213000-npm-offline`) and the two hang fixes (`fix/hangs-1105`) merged at
`12d3164de`; v0.1.5-rc.0 is `fcfe756f1`, tagged `v0.1.5-rc.0`. Its round
(`work/round-1106-rc.sh`, evidence `work/integrate/build/round-1106rc-evidence/`): 6 images
rebuilt with unchanged pins (209 recipes); source 473, artifacts 26, browser suites, the npm
offline flow in both browsers, every demo the round runs (tmux in Firefox among them) and every GPU
test (slopyard among them). Packaged and checked by `scripts/release-checklist.sh`: 18,615 files,
93 header rules; served locally, v0.1.0 to v0.1.5 boot in both browsers and `amy install lean`
proves from the served site (44 s, 58 s). Deployed 09:26 to 09:30 over last night's /v0.1.5/
(`15929916a`, its files in `work/evidence-2026-11-06/`). Live: every file of v0.1.5 and every
version's list on slopshare.dev; v0.1.0 to v0.1.5 boot in both browsers on both domains;
`amy install lean` proves from slopshare.dev (143 s, 161 s). v0.1.5 is archived in
`work/locks/published`; its list's SHA-256 is
`9227bdcd1c8fe4e5a505c7b1f31798c2cb6f7040e184192b707b55ff10543cd8`.

npm: the 25 packages of `config/npm-images.txt` at 0.1.5-rc.0, packed from `fcfe756f1`, passed
`test/npm-browser.mjs` offline as tarballs in Chromium and Firefox, and are published under the
dist-tags `rc` and `latest`; the registry's integrity of each is the tested tarball's. The
README's `npm install` from npmjs.com in an empty app installs 0.1.5-rc.0 throughout, and its
`dolly-build init` and build ran with only loopback reachable.

Left for v0.1.5: the tag, the GitHub release (`gh release create v0.1.5
.cache/dolly-seed-compiler-0ceba5af9bed3f258fd0c635f3ad5f21c813b6ccb8eef7e236169428a74a4d3d.tar
--verify-tag --notes-file NOTES`; `DOLLY_SEED_COMPILER_URL` names that asset) and npm at 0.1.5.
Not on the site: python-data, ffmpeg and openblas (`tasks/20261105-181900-domain-catalog`).

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
