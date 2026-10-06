# Integrate the 2026-10-05 round into a local release candidate

- STATUS: OPEN
- PRIORITY: 340
- TAGS: integration,release

The integrator's record of the round, so an interrupted session can be resumed.

## Branches and worktrees (under `work/`)

| Worktree | Branch | Task |
|---|---|---|
| `host-modules` | `integrate/1005` (main + host-modules contract batch, image inputs `2cc92c2b…`) | round 1: verify and publish |
| `round2` | `integrate/1005-seed` (`integrate/1005` + `work/zero-ad-self`) | round 2: merge everything below, one catalog rebuild |
| `audit-core` | `fix/audit-core` (from `integrate/1005-seed`; seed batch) | silent-126, userspace-gaps, git-fetch |
| `presenter` | `fix/page-presenter` | page-presenter |
| `packages` | `work/more-packages` | more-packages |
| `pi` | `work/pi-1` | pi-1, pi-skills |
| `webgpu` | `work/webgpu-any-gpu` | webgpu-any-gpu |
| `site` | `work/licences` | licences, robots-txt |
| `recordings` | `work/demo-recordings` (source only) | demo-recordings |
| `claude` | `work/claude-code` | claude-code, janis-node-gaps |
| `signals` | `fix/signal-regression` | its own task: libuv SIGINT probe (`cmake`) and the `rts` stall |
| `review` | `review/big-picture` (source only) | big-picture |
| `slopyard-world` | `work/slopyard-world` (two unverified Lua edits, uncommitted) | slopyard-living-world |

Agents were told to have verified commits by 02:30 JST. Nothing is pushed or
deployed; `main` stays at the deployed `18e445e7` until a candidate passes.

## Round 1 (`integrate/1005`)

Verified on the catalog built for `2cc92c2b…` (2026-10-05, 22:17-22:50 JST, logs
in the integrator's scratchpad):

- Source suite 332 pass. Artifact suite 23 of 24: the supervisor-contract test
  compared the new word-layout globals with kernel exports (fixed, `c5b9e132`).
- Browser suites pass in Chrome and Firefox except `host-compute` in Firefox:
  Playwright's Firefox has no WebGPU adapter without a desktop, also on the
  deployed `cb8530a6`; the 2026-10-02 pass had inherited the owner's `DISPLAY`.
  The test now asserts the documented refusal there (`ce74d524`).
- Demo tests pass for python, javascript, emacs, pi, neovim, rust, sdl2,
  studio, codex, bhop and classicube. `cmake` fails: its libuv probe no longer
  handles SIGINT (status 130). It fails the same way on the deployed
  `cb8530a6`, so the regression shipped on 2026-10-02; the only core change
  after the last passing run is `d67ec56e` (pipe wakeup). `rts` failed once
  under load ("mouse menu/quit must not stall either player"). Both are with
  the agent on `fix/signal-regression`.
- `npm run publish` accepted every image (inventory checks pass) and then
  refused to seal: "release source does not match the selected checkout",
  because the integrator committed a task note in this tree while it ran. Not
  rerun: round 2 produces the candidate. Do not commit in the tree being published.

## Round 2 (`integrate/1005-seed`, worktree `round2`) — state at 00:30 JST, 2026-10-06

Merged and repinned so far, source suite green except the licence inventory
(waiting for the 0 A.D. rows on `work/licences`): `work/zero-ad-self`,
`integrate/1005`, `work/licences`, `work/pi-1` (own `node_modules`, `npm ci`),
`work/claude-code`, `fix/signal-regression`, `fix/page-presenter`, and the
Slopyard test fix `a32f69b1`.

Still out, due 02:30: `fix/audit-core` (the seed batch), `work/more-packages`,
`work/webgpu-any-gpu`, the `work/licences` follow-up, `work/demo-recordings`.
Not for this candidate unless verified early: `core/kernel-boundary`
(worktree `signals`; step 1 keeps images valid), `core/iteration` (worktree
`presenter`; `20260930-100000-audit-53`). Slopyard is deferred.

Then: `npm run build:runtime`; the Rust seed if `process.h` changed;
`DOLLY_IMAGE_JOBS=4 npm run image`; source, artifact, browser and demo suites;
`npm run publish`; serve on :9003. A preview with Pi 1.0 (`default`, `pi`,
`dollyfile-studio`; release `24e7c6d0…`) is served on :9004 from `work/pi`.

Rules learnt tonight: recipe conflicts are merged with
`merge-recipes.py` (integrator's scratchpad: recipe pins zeroed, then
`update-recipe-pins.mjs`); image builds go through `work/build-slot.sh`; the
root `node_modules` is stale (Pi 0.84.4) and must be refreshed with `npm ci`
once no agent is using it.

## Interrupted at 01:20 JST, 2026-10-06: the usage limit was reached

State of `integrate/1005-seed` (worktree `round2`), tip `d612e10f` plus this note:
merged and repinned: zero-ad-self, integrate/1005, licences, pi-1 (Pi 1.0.3 and
skills), claude-code (Janis), signal-regression, page-presenter, kernel-boundary
step 1 (`ff3a5c19`), audit-core (the seed batch), and the integrator's Pi-skill
update. Source suite 356 pass, 1 fail (licence inventory lacks the 0 A.D. rows).

A preflight is running detached in this tree (runtime built, image inputs
`1c081c54…`; then the `default` chain and core browser suites; log
`…/86b87808…/scratchpad/preflight.log`). It rewrote pins in 51 recipes in the
working tree: discard them (`git checkout -- .`) before merging anything.

Not merged yet:
- `work/webgpu-any-gpu` (finished, reviewed, accepted; the merge was refused
  only because the tree was dirty). Resolve recipes with `work/merge-recipes.py`.
- `work/demo-recordings`: new Studio recording `754330a3`, message fix `c896f223`.
  `stealth/space-bunny-alpha` left OpenRouter at 01:05 JST (404), so RTS,
  ClassiCube and bhop are not re-recorded.
- `work/licences`: follow-up in progress (0 A.D. and `qwen3.5-800m` inventory rows).
- `work/more-packages`: in progress; asked to sort the receipt's member lists
  in `src/dollyfile.c` (image digests follow readdir order) and to measure a
  compiler-free base.
- `core/kernel-boundary` (worktree `signals`): step 2 in progress; it changes
  `system-build`'s digest, so it must ride a catalog rebuild.
- `core/iteration` (worktree `presenter`): `audit-53`, to merge after the candidate.

Next steps: merge the above; `node scripts/update-recipe-pins.mjs`; source suite;
`npm run build:runtime`; `demos/rust/build-rust-toolchain.sh` (the sysroot
changed; `build/rustc-port` was being copied from `work/host-modules`);
`DOLLY_IMAGE_JOBS=4 npm run image`; source, artifact, browser and demo suites
(plus `zero-ad`); re-verify the Pi skill in the rebuilt `pi` image;
`npm run publish`; serve on :9003. Do not commit in the tree while publishing.

Decisions waiting for the owner: target identity (`20261005-133402`), what Slop
is for, the runtime/process-modules recommendation (`20261002-073000`), a git
relay (`20261005-131649`), the licence points (`20261005-135857`), 4B as part
packages (`20261005-131646`), Claude Code's limits (`20261005-133044`).

## Round 2 result (2026-10-06, 03:18-04:46 JST)

Release candidate `e245b123…`, built from `5c7457b9` on `integrate/1005-seed`
(image inputs `047fc328…`, 61 images rebuilt in 60 minutes with four
builders), served on http://localhost:9003 from `work/round2`.

Merged after the interruption: `work/webgpu-any-gpu`, `work/demo-recordings`,
`work/more-packages-seed` (packages, the packaged core, the receipt order),
`work/licences-2` (inventory rows). `demos/zero-ad/Dollyfile-zero-ad-deps` was
pointed at the renamed `Dollyfile-sdl2` package.

Verified on the rebuilt catalog (logs in the integrator's scratchpad, `round2/`):
- Source suite 357 pass; artifact suite 24 pass.
- Browser suites in Chrome and Firefox: all pass. `minimal` first failed on a
  stale expectation of the refusal text and passes since `1723a563`.
- Release acceptance for every image (part of `npm run publish`).
- Demo tests: python, javascript, emacs, pi, neovim, rust, cmake, sdl2, studio,
  codex, bhop, classicube pass. `rts` failed once in the pipeline ("both native
  games must animate during the slow model's response") and passed alone in
  256.7 s: the early-frame race of `20261005-151321-rts-early-input-stall`.
- The Pi skill's updated statements were run in the rebuilt `pi` image:
  `xargs -P 4`, curl status 9 on a policy refusal, the exit-126 line naming
  `gpu@0`, `require` and `import` in `janis -e`, `.mjs` modules.

The first catalog attempt failed in preparation: `prepare-emacs.sh` downloads
from ftp.gnu.org before checking its cache, the host timed out, and this
worktree's `.cache` lacked the archive (copied from `work/host-modules`, and
into the root `.cache`).

Not in this candidate: kernel-boundary step 2 and later (`core/kernel-boundary`,
worktree `signals`), `core/iteration` (worktree `presenter`, to merge next),
the licence texts of 0 A.D.'s linked libraries (`work/licences`, WIP `98803d3f`),
new recordings for RTS, ClassiCube and bhop (the model left OpenRouter).

GPU-dependent tests on the candidate (private Xvfb `:130`, run directly because
`demos/run-browser-tests.mjs` strips `DISPLAY`), 04:56-05:03 JST, all exit 0:
`demos/local-llm/test/local-llm-browser.mjs`; 0 A.D. `spidermonkey`, `openal`,
`enet`, `engine`, `multiplayer` (149 synchronized turns, shared hash
`f3dd66c3…`) and `graphics zero-ad hardware` (adapter `nvidia blackwell`).

`core/iteration` conflicts with the packages work in `test/browser-server.mjs`
and `test/image-inventory-browser.mjs` (its code moved to `scripts/`); the merge
was aborted and its agent asked to rebase onto `integrate/1005-seed`.

Tag `rc-2026-10-06` marks `5c7457b9`, the commit the release was built from.

## Final candidate (2026-10-06, 05:59 JST)

Release `2de39ded…`, built from `6e29f073` on `integrate/1005-seed`, served on
http://localhost:9003 from `work/round2`; tag `rc-2026-10-06` marks that commit.
After the first round-2 release (`e245b123…`) it gained:

- `1253d06c`: the `pi` image names no default model. `67a65263` had made
  `stealth/space-bunny-alpha` the default; OpenRouter removed that model at
  01:05 JST. Nine images rebuilt in 8 minutes; source 357, and the `pi`,
  `studio`, `javascript`, `bhop`, `classicube` and `rts` demo tests pass.
- `core/iteration` (`81bfee00`), rebased by its agent onto the candidate and
  verified there; source 358, artifacts 24; the publish ran its new
  `scripts/accept-release.mjs` over the whole catalog (release `db395aae…`).
- The Slopyard coplanar-ground fix (`174d9837`); `slopyard` rebuilt, its browser
  test passes on a private display.

Open at hand-over: kernel-boundary step 2 and later (`core/kernel-boundary`,
worktree `signals`); the licence texts for 0 A.D.'s linked libraries (`work/licences`,
WIP `98803d3f`); recordings for RTS, ClassiCube and bhop (no model chosen since
`stealth/space-bunny-alpha` left OpenRouter); the owner's decisions listed above.

## After the hand-over (2026-10-06, from 06:15 JST)

The owner delegated the open decisions ("research them thoroughly and go with
the answer that aligns with the goal of the project") and asked for a local
deployment: :9003 serves the full catalog (`2de39ded…`), :9005 the
daugasauron.com packaging (`d6a822c9…`, with `/agents/`), both from `work/round2`.

Running, each in its own worktree on the candidate's source:

| Worktree | Branch | Work |
|---|---|---|
| `core-decisions` | `core/decisions` | runtime/process (accepted), target identity, what Slop is for, models above the image cap |
| `licences3` | `work/licences-3` | 0 A.D. source as recipe inputs, the GPL-marked files, ClassiCube's textures (the owner asked whether GPL for the whole tree would settle it: no; MIT stays) |
| `recordings` | `work/demo-recordings` | a free replacement model, then the remaining recordings |
| `pi-local` | `fix/pi-local-loop` | high priority: Pi repeats its second tool call forever in `pi-local`, both browsers |
| `local-models` | `work/local-models` | `20261006-…-local-models` |

Merged since: `fix/git-fetch` (a relay is provider policy, `DOLLY_HTTP_RELAYS`);
the Pi images need rebuilding for its skill edit.

## Plan until 18:00 JST, 2026-10-06 (owner's goal; handover `/tmp/dolly-handover-2026-10-06.md`)

The owner's other session stood down at 07:55 and its tasks are the
integrator's. Deliverable at 18:00: a clean local commit (not pushed) and a
release candidate on localhost. Order of work, agent count kept modest:

1. In flight: the `pi-local` loop (`fix/pi-local-loop`; cause: fixed seed and
   low-temperature sampling, no bound on repeated calls), the Firefox
   selection timeout (`fix/firefox-selection`), local models
   (`work/local-models`), target identity and its ports (`core/decisions`).
2. Started now: Cargo (`work/cargo-native`, the owner's first wish) and the
   Studio video (`work/demo-recordings`, a paid model allowed for it).
3. Next, as agents free up: explicit `runtime@0` (owner's decision), small
   default, the spawn investigations, the package index, amy descriptions,
   man and help; touch input after the Firefox fix.
4. One seed round for everything that changes the seed or every recipe
   (target identity, explicit runtime, small default, Slop's message for a
   missing path, Cargo's libcurl additions if ready): cut about 13:00, catalog
   rebuild, full verification, publish. A last small round before 18:00.

## Checkpoint at 18:00 JST, 2026-10-06

Release line (image inputs `047fc328…`), built from `db2c9787`, tag
`rc-2026-10-06-pm`: full catalog `67e4b255…` on http://localhost:9003,
daugasauron.com packaging `c60a2c6f…` on http://localhost:9005 (with the new
Studio video). Source suite 360 pass on that commit. Merged and verified
since the morning candidate: the git relay as provider policy, the licence
decisions (0 A.D. source as recipe inputs, MIT for Dolly's own game agents,
own ClassiCube textures), Pi's masked API-key entry, the kernel fix for
pointer records dropped at a program's retirement, the `pi-local` sampling fix
and repeat bound (local-model test passes in Chrome and Firefox on the GPU),
the new Studio video.

Fable credits ran out at about 09:50 and five agents died mid-work; the
session stalled until 18:00, when the owner switched it and every subagent to
Opus 5.5. Relaunched on Opus, each on its predecessor's worktree:

| Worktree | Branch | State |
|---|---|---|
| `runtime` | `work/explicit-runtime` | reviewing the inherited change; becomes the seed round's base after merging `core/decisions` |
| `cargo` | `work/cargo-native` | seed commits in verification (libcurl, `flock`, `ar`); Patti building Cargo |
| `userspace2` | `fix/userspace-2` | Slop's missing-path message, `ls -l`, Pi's cwd: coded, being verified |
| `local-models` | `work/local-models` | no seed change; end to end in Chrome; Firefox, Studio, table next |
| `core-decisions` | `core/decisions` | ready (target identity), waits for the seed round |

Seed round, when those report: explicit runtime + target identity + userspace
batch + Cargo's seed commits, one catalog rebuild, full verification, publish.

## State at 21:00 JST, 2026-10-06 (resume here)

Release candidate, unchanged since 18:00: tag `rc-2026-10-06-pm` (`db2c9787`),
full catalog `67e4b255…` on :9003 and the daugasauron.com packaging
`c60a2c6f…` on :9005, both served from `work/round2/build/` (restart with
`DOLLY_PORT=9003 node scripts/serve.mjs` and
`DOLLY_PORT=9005 node scripts/serve.mjs build/domain-releases` in `work/round2`).
`main` has moved past it with page-only and content changes that are not
published: the new Studio video (`a8b5198e`), the corner indicators
(`7ecc1466`, also served from its working tree on :9006 by `npm run dev`),
and tasks.

The machine was rebooted at 19:54 after running out of memory (a catalog
build, a publish and six agents' browser sessions at once). Since then every
heavy command runs in `systemd-run --user --scope -p MemoryMax=…`, and logs
live under worktrees, not `/tmp`.

### Seed round in progress (`integrate/seed-1006`, worktree `round2`)

Explicit `runtime@0` + target identity (`__dolly__`) + the userspace batch
(`ls -l`, Slop's missing-path message, Pi's cwd). Image inputs `22d006ca…`.
The pipeline `build/seed-evidence/seed2.sh` was restarted at 19:58 inside a
26 GB scope and runs unattended: catalog, pins commit, source, artifact,
browser and demo suites, GPU tests, then a publish into `build/seed-releases`
(not the served directories). Read `build/seed-evidence/seed2.log`; if every
suite passed, serve it with
`DOLLY_PORT=9007 node scripts/serve.mjs build/seed-releases`, merge
`integrate/seed-1006` into main and close `explicit-runtime`, `target-identity`,
`slop-path-not-found`, `ls-long-format` and `pi-cwd`.

### Written and committed, not yet built or run in a browser

All on the new seed unless noted. Build order and likeliest failures for the
first group are in `20261005-220754-man-help` ("Merged branch").

| Branch | What | Verify with |
|---|---|---|
| `integrate/userspace-next` (`7976b8ea`) | `man` and retained pages, small `default` (minimal removed), `amy-index.txt` and amy descriptions, the `dolly-docs` package, concurrent pipelines with `&` and `wait` | full catalog rebuild (it changes the seed), then all suites, `test/man-browser.mjs`, `test/docs-browser.mjs` |
| `fix/page-ending` (`245efbec`) | the page states how an image ended | `test/ending-browser.mjs`; look at the last frame by eye |
| `fix/entry-missing` (`adce6385`) | the engine refuses an image whose ENTRY is not retained (seed) | `test/image-browser.mjs`, `test/custom-session-browser.mjs` |
| `fix/session-policies` (`ef994618`), `fix/shell-env` (`68f71983`) | two small fixes from the spawn measurement | their browser tests, named in the tasks |
| `fix/pi-greeting` (`3d196a15`, old line) | Pi answers conversation without tools | rebuild the Pi chain; one "hi" batch on `pi-local` |
| `work/local-models` (`2579350b`, old line, verified there) | `/local`, model packages, the 4B as four packages | add `REQUIRES HOST runtime@0` to its four new recipes; rebuild the model images, `pi-local`, Studio on the new seed |
| `work/cargo-native` (`efbcb756`+, old line) | `ar q/s` (seed), libcurl additions (curl package), Patti fixes, Cargo staging | next seed round; Cargo itself: see `20260930-231102-cargo-native` |
| `core/kernel-boundary` (`a9a6ec42`) | step 2, unverified | rebase onto the seed line, rebuild `default`, suites |
| `work/licences` (`98803d3f`) | licence texts for 0 A.D.'s linked libraries, WIP | superseded by `work/licences-3`, already merged: delete after checking |

### Decided by the owner today

Explicit `runtime@0`; `dso@0` (`20261006-111835-dso-module`); corner indicators
hide after ten seconds; `less` wanted (`20261006-111926-less-pager`). Still
open for him: no `spawn@0` module and direct-ENTRY images as a supported shape
(`20261005-222449-*`), a git or crates.io relay for the public sites, a model
for re-recording RTS Arena.

### Next process-contract round (one rebuild)

`input@0` (`20261002-072000`), kernel advisory locks (`20261006-093856`,
which must also cover SQLite's byte-range locks), `dso@0`, kernel-boundary
steps 2 to 4, Cargo's `ar` commit, `fix/entry-missing`.

## Night plan, 21:00 to 06:00 JST (owner: "Continue working until 6am")

Memory is rationed mechanically: `work/slot.sh browser|build COMMAND` (caps
6 GB and 10 GB; slot counts in `work/.slots/*.count`, one build and two
browser slots while a catalog pipeline runs, more otherwise). Catalog
pipelines run alone in a 26 GB scope.

1. Seed round (`integrate/seed-1006`, `work/round2`): finishes unattended;
   on green, merge to main, package both sites, serve on :9003 and :9005.
2. `integrate/next` (`work/next`): the userspace merge verified on a rebuilt
   `default` chain, then every finished branch merged on top (indicators, page
   ending, missing ENTRY, the two small fixes, greeting wording, local models,
   Cargo's two core commits, the Slop `set -e` fix). Then one catalog rebuild,
   full verification, publish.
3. Process-contract round, code first on light worktrees, each verified on a
   `default` chain when it asks for a full worktree: `core/dso-module`,
   `core/file-locks` (flock and fcntl ranges), `core/input-module`,
   `core/kernel-boundary-2`. A third catalog rebuild only for what is verified
   by about 03:30.
4. Alongside: Cargo to `cargo build` and a package; Slop against real
   configure scripts.
Queued for free slots: `rts-early-input-stall`, `amy-descriptions` (rest),
`less-pager`, `audit-24`, `local-context-size`.

### 21:15: the seed round's catalog failed twice over; third start

- The 26 GB scope was too small for three builders when `codex-build`
  (renderer at 14.5 GB), `pi-local` (10.3 GB) and `zero-ad` overlapped: the
  kernel's cgroup OOM killer took the first two at 20:36:32 (`journalctl -k`,
  "Memory cgroup out of memory"; the build reports "page.evaluate: Target
  crashed"). The cap did its job; the scheduling was mine. Large images now
  build apart: phase A is `pi-local`, `slopyard`, `dollyfile-studio` two at a
  time; phase B is the Codex chain alone.
- `slopyard --check` span at full CPU for 71 minutes. Cause: the target
  identity removed `__EMSCRIPTEN__`, and Box3D then selects its
  unknown-platform path, whose `b3CreateThread` calls the worker loop inline
  and never returns. The reading in `20261005-133402-target-identity` missed
  it. Fixed in Slopyard's own wrapper (`07fa5f0b` on `integrate/seed-1006`);
  the catalog round is what found it, which is the argument for measuring
  ports by building them.
- Restarted at 21:14 as `work/round2/build/seed-evidence/seed3.sh` (log
  `seed3.log`, builds `catalog-a.log`, `catalog-b.log`); 55 of 61 images were
  kept. Expect the catalog at about 22:45, verification by 23:45, packaging
  after.

## `integrate/next` (worktree `work/next`, from `integrate/userspace-next` `7976b8ea`; 2026-10-06, 20:50 to 23:30 JST)

The branch the next catalog round starts from. Nothing here built a Rust-chain
image, `pi`, a model or a game: those are the catalog round's.

### Merged, in this order

| What | Tip | How it went in |
| --- | --- | --- |
| `work/man-help` | `b35fab2f` | base of the branch |
| `work/small-default` (holds `work/amy-index`) | `9d9064b3` | page rows added to `posix` and `git` |
| `core/self-description` | `a4c1bca4` | clean |
| `core/concurrent-pipelines` | `5ccedb2e` | clean, twice (the second time for `set -e` and loop status) |
| `07fa5f0b` from `integrate/seed-1006` | | cherry-pick: Box3D under the Dolly target identity |
| `main` | `9dd772f2` | imports of `src/browser.mjs` and `host/download/download.mjs`: both sides kept |
| `fix/page-ending` (holds `investigate/spawn`) | `245efbec` | one table row each in `docs/browser-boundary.md`: both kept |
| `fix/pi-greeting` | `3d196a15` | clean |
| `fix/session-policies` | `ef994618` | its task file is the branch's |
| `fix/shell-env` | `68f71983` | `Dollyfile-minimal` stays removed; its task file is the branch's |
| `fix/entry-missing` | `adce6385` | `scripts/lint-dollyfiles.mjs` keeps the ENTRY check and the description check |
| `faee3872`, `7d71e824`, `dca3ef58`, `14da533a` from `work/cargo-native` | | cherry-picks; Patti's source pin and the HTTP document's pin refreshed |
| `work/local-models` | `2579350b` | last, so dropping it is a reset; the four `qwen3.5-4b-N` recipes gained `REQUIRES HOST runtime@0`; `Dollyfile-qwen3.5-800m` removed as on the branch |

Left out: nothing on the list. Not taken, as told: the Cargo staging and the
`cargo` package (`eeb0d42d`, `ff412ee0`, `3540fe1d`, `cab675f9`).

After each merge: `npm run -s lint:dollyfiles` and the source suite
(`node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'`), green each time
after the fixes below. Every recipe declares `REQUIRES HOST runtime@0`
(66 recipes).

### What the first build and the suites found, and the fix

- `system-build` stopped in the page-capture loop: Slop runs its own `cd` for
  the word `cd`, which takes `--help` as a directory. The loop runs
  `/bin/NAME` (`fbfc278b`). `cd --help` typed at a prompt still fails that
  way: Slop's own `cd`, `command` and `time` have no `--help`.
- Two tests asserted the serial pipeline: that the consumer of an interrupted
  producer never started (`test/fixtures/slop-interrupt.c`,
  `test/core-browser.mjs`). Stages start together, so the consumer runs; what
  follows the pipeline does not, and the status is 130. The tests now say
  that (`1c0ae0e3`); Slop is unchanged.
- `default` holds no compiler, Make, Git, `download` or `upload`. Suites that
  use them open `system`: shell, slop, terminal, display, process (its
  start-up script block stays on `default`), cpp, network, upload, image,
  indicators, fs-growth. `image` checks its cache rules on `system-tools` and
  `system`, which are base and child as `system` and `default` used to be.
  `threads` opens a page-built image: `system` plus `REQUIRES HOST threads@0`.
  `docs`, `shell-env` and `session-offline` named `minimal`, which is gone,
  and open `default`.
- `test/dolly.artifacts.mjs` did not know the `dolly-docs` package (`a34f0d38`).
- `session-offline` opened its saved session in a new page, which is a new
  browser profile: it reloads in the page that saved it.
- The lint test of `fix/entry-missing` built a checkout without the README
  lines the description check of `work/amy-index` wants: the fixture has them.
- The image pages (`/system/` and the rest) are generated copies of
  `terminal.html` and bundle the process Worker: after a merge that changes
  the page, `npm run routes` (with the same `DOLLY_BUILD_IMAGES`) before a
  browser suite. `indicators` failed until then.
- `node scripts/update-recipe-pins.mjs --sources` re-pins every prepared
  source from whatever `dist/static` holds, stale copies included
  (`rust-sdk.tar.gz`, the Studio and 0 A.D. tars): after a document edit only
  `Dollyfile-dolly-docs` was kept from it.

### Verified on the final merge

`npm run build:runtime`: runtime `dccf70f93da8…`, image inputs
`4431ea8002ae84a40d997d58f3a502a03301f53b23bf9030b139cdbffb6fc9a2` (the
first chain was `e8e495dc…`; the cherry-picked `ar` commit and the engine
change moved it). `include/dolly/process.h` is unchanged; the process sysroot
is `31b4bef1…`, changed from the seed round's `819e80da…` by the `SIGPIPE`
line of `libc-adapter.c`, so the Rust seed is relinked before the catalog
(`14da533a` changes its inputs too).

Built through the slot in 830 s (`build/next-evidence/image-build-3.log`):
`system-build`, `core`, `zlib`, `gzip`, `curl`, `zig-build` (464 s),
`ghostty-build`, `display`, `system-tools`, `posix`, `amy`, `default`
(14,398,305 bytes), `cc`, `dolly-docs`, `git`, `system`, `python` (106 s, the
first CPython build with concurrent pipelines).

- Source suite: 400 of 400. Artifact suite: 24 of 24 over the 17 built
  images; the registry lists only those, so no artifact test fails for an
  unbuilt image, and none ran for one.
- Browser, Chromium and Firefox, one slot per suite
  (`build/next-evidence/browser-final/summary.txt`): core, man, default, docs,
  shell, slop, process, terminal, display, boundary, host-modules, image,
  custom-session, indicators, shell-env, session-offline, threads, cpp,
  network, upload: all pass.
- `ending`: passed 6 of 8 runs. In one run, in both browsers, Ctrl+C on a
  script looping over builtins left the page saying "exited with status 130"
  where the test expects `SIGINT`; four reruns passed. The page names a signal
  only when the exit request carries one; which path ends the shell without
  one was not found.
- `amy`: the first block passes (the index, `amy install python`, a saved
  session); "amy programs" stops at `amy install cmake`, a package this tree
  did not build (it also wants `sdl2`, `rust`, `codex-cli`), so its last two
  blocks did not run.
- Not run: `fs-growth` (its page is killed by the 6 GB browser cap in both
  browsers), `test:demos -- pi` and anything on the Rust chain.

Concurrent pipelines, first run in Dolly (`slop` suite, image `system`): the
thirteen pipeline cases pass in both browsers, among them
`seq 1 999999999 | head -n 1` (ends at once, 141 under `pipefail`), three
programs, a program feeding a loop feeding a program, `&` with `wait` and
`$!`, a background pipeline, and Make's output reaching `tee` while its recipe
still runs (added here); `set -e` at the prompt stops the failing line and
leaves the shell running (added here). `yes | head -1` cannot be typed: the
images have no `yes`. No difference from the native model was seen in the
kernel's wake-ups or in `SIGPIPE`.

### For the catalog round

- Relink the Rust seed first (sysroot and `exe-suffix` changed).
- Recipes with unverified page rows: `ripgrep` (`rg --help` captured at build).
- `core/concurrent-pipelines` after `5ccedb2e` is not merged, as decided.
