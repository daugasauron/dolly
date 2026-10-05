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
