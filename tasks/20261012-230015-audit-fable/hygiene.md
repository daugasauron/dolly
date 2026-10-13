# Audit: the repository against its own Zen

Scope: `main` at 743757a4, read-only. Numbers are from `git ls-files`/`wc`, `git log --since=2026-09-13`, and a dependency graph computed from the 103 recipes' `/v0.1.2/…Dollyfile-*` references. Vendored/generated were separated by `src/ghostty/generated/` (has its own README and SHA256SUMS), `*.patch` (diffs of upstreams), binary extensions and `package-lock.json`; everything else is written in this repo (I checked the heads of `janis.js`, `quickjs-main.c`).

## The five things I would do first

1. Take `/vX.Y.Z/` out of recipe references: a version bump rewrote 85–86 files twice in three days and made all 103 images stale each time.
2. Remove `INSTALL dolly-docs` from `demos/pi/Dollyfile-pi:19`: 242 docs commits in 30 days each re-pinned the three deepest images (pi, pi-local, dollyfile-studio).
3. Add `test:changed`: join the stale set that `npm run image -- X --plan` already prints with each browser test's declared image, and run test files in parallel.
4. Give images a measured memory budget instead of a flat 10 GiB: on this 16-core/60 GB machine the formula allows at most 6 concurrent builds.
5. Delete: 38,616 lines of closed tasks, 24 MB of site media, the GitHub Pages target, ~250 lines of `test/dolly.artifacts.mjs`, the stale image graph in `docs/architecture.md`.

## Size by area (tracked, measured)

| Area | Files | Lines | Note |
|---|---|---|---|
| `src/` hand-written | 101 | 28,200 | excludes `src/ghostty/generated/` (7 files, 233,772 lines) |
| `host/` | 137 | 12,313 | 16 modules + manifests |
| `include/dolly/` | 5 | 861 | `process.h` is 702 |
| `scripts/` | 68 | 5,664 | |
| `test/` | 147 | 15,742 | source 4,367; browser 4,024; fixtures 6,567; artifacts 458 |
| `docs/` | 16 | 2,494 | (sixteen, not thirteen) |
| `abi/`, `config/` | 8, 14 | 410, 1,886 | config includes 6 patches |
| Recipes | 103 | 10,237 | 24 root (3,664), 79 in demos (6,573) |
| `demos/` hand-written | ~600 | 66,951 | excludes 58 patches (12,759) and binaries; 12,195 are Slopyard Lua programs |
| `tasks/` | 440 | 45,693 | 84.5% closed history |
| `sites/` | 5 | — | 24.2 MB of 41.5 MB tracked bytes |
| root pages | 9 | 661 | |

Twenty largest hand-written: `src/slop.c` 5,380; `demos/javascript/janis.js` 3,154; `src/process-kernel.c` 2,461; `Dollyfile-system-build` 2,248 (1,822 lines inside 30 FILE blocks); `src/dollyfile.c` 2,183; `quickjs-main.c` 1,966; `src/compiler.cpp` 1,876; `src/process/libc-adapter.c` 1,567; `slopyard/src/world.c` 1,318; `src/libcurl-fetch.c` 1,098; `src/ghostty/display.c` 968; `slopyard/src/main.c` 917; four Slopyard Lua programs 733–854; `wine/test/wine-browser.mjs` 804; `src/process-supervisor.mjs` 801; `wine/winebuild-dolly.c` 771; `Dollyfile-bhop` 769; `dolly-node.js` 751; `src/commands/find.c` 728.

## Findings, ranked by value for effort

**1. The version prefix in every recipe forces a full-catalog rebuild per release.**
Evidence: `src/static-asset.mjs:21-22` prefixes every reference with `/v${DOLLY_VERSION}/`; 618 such references across 103 recipes. Commits 4349ce77 (10-09, 85 files, 594 lines) and d802b73b (10-11, 86 files, 585 lines) rewrote every recipe; `scripts/build-system-snapshot.mjs:100-105` then reports "recipe changed" for all 103. Two 5.5 h rebuilds in one week caused by a string.
Do: reference recipes by site-relative path; the page already serves only its own version's files (`scripts/serve-checkout.mjs`, deployment per `/vX.Y.Z/`), and the SHA-256 pin is the identity. Change `sitePath`, the lint at `scripts/lint-dollyfiles.mjs:44-49`, one test (`test/dollyfile-graph.test.mjs:37`).
Risk: none to identity (same pin, same bytes). Confidence: high.

**2. Blast radius is structural: one root, FROM-layering, and Zig on the critical path.**
Evidence: `system-build` has 100 transitive dependents; 93 of 103 recipes use `FROM`, so a base's bytes are copied into every child snapshot (no early cutoff is possible). Longest chain, depth 14: system-build → zig-build → ghostty-build → display → system-tools → system → python → rust-llvm → rust-build → ripgrep → pi-coding-agent → pi-runtime → pi → pi-local → dollyfile-studio. `Dollyfile-system-tools:447` installs `display`, which is COPYed from `ghostty-build` (`Dollyfile-display:6`), which is FROM `zig-build`: every image with a terminal (88 downstream of system-tools) waits for Zig-built-from-C. Local snapshot mtimes from the last build: system-build 09:04, zig-build 09:11, ghostty-build 09:12, system-tools 09:15.
Do: take `display` out of `system-tools` (applications INSTALL it, as `Dollyfile:20` already does) so Zig/Ghostty build in parallel with the tools chain. The 23 recipes FROM `system` need an `INSTALL display` row.
Risk: the ~8 min saving is this machine's; measure before and after. Confidence: high on structure, medium on gain.

**3. Parallelism is memory-bound by a flat budget.**
Evidence: `scripts/build-system-snapshot.mjs:28-31`: jobs = min(cores, freemem/10 GiB) though the comment says "most peak below 5 GB"; here 16 cores, 60 GB → ≤6 Chromes (3 as I ran it). The 5.5 h is 103 images through ≤6 lanes.
Do: record peak RSS per image in the snapshot metadata on each build and schedule by it; big images (`zero-ad` 2 GB snapshot, LLVM, Rust) keep 10–17 GiB, the rest 5. Risk: an OOM-killed builder; the scheduler already treats a failed child as failed (`:237-240`). Confidence: high.

**4. Docs edits re-pin the three slowest images (not all 105).**
Evidence: docs are not in `dolly.data` (`toolchain/CMakeLists.txt:83-95` lists the seed; `prepare-image-sources.sh` copies no docs), so the recipe graph is the only path: `Dollyfile-dolly-docs` is INSTALLed by `demos/pi/Dollyfile-pi:19`; pi-local is FROM pi; dollyfile-studio FROM pi-local, which also packs `dollyfile.md` a second time (`demos/studio/prepare-sources.sh:14-15`). 242 commits touched the 13 shipped docs in 30 days on 13 of 21 commit days; `Dollyfile-dolly-docs` was re-pinned in 53 commits.
Do: drop the INSTALL (a session can `amy install dolly-docs`); drop the studio copy. Risk: pi's agent loses offline docs; one `.dollyrc` hint. Confidence: high.

**5. Tests are not selected by what changed, though the plan already knows.**
Evidence: `--plan` prints `build IMAGE: reason` (`build-system-snapshot.mjs:189-197`); 33 of 36 core browser tests declare `image: "system"`, 2 `audio-sdk`, 1 `default`; every demo test declares its image. `test/browser-tests.mjs:8-11` runs 35 files sequentially with `spawnSync`, each starting its own server (port 0, `serve-checkout.mjs:26`) and two browsers; 45 `open()` boots of a 160 MB snapshot.
Do: `test:changed` = tests whose image is stale, plus all core tests in one browser when `src/*.mjs` or `host/**/*.mjs` changed; run files concurrently. Keep the two-browser full run as the merge gate. Risk: a page-module change is "every image", handled by the rule above. Confidence: high (gain unmeasured; the README's timings at `README.md:86-95` are from commit 00054519, 951 commits and 14 browser files ago).

**6. Ten demo browser tests never run; two always pass.**
Evidence: `demos/run-browser-tests.mjs:7` runs only `DEMO/test/DEMO-browser.mjs`; zero-ad has eight `0ad-*-browser.mjs` and no `zero-ad-browser.mjs`; `llvm/test/stage2-browser.mjs` and `mojo/target/test/mojo-target-browser.mjs` are unrun. Line 10 strips `DISPLAY`, so `gpu-fluid-browser.mjs:6` and `slopyard-browser.mjs:12` exit 0 before any assertion. There is no CI that runs tests (`.github/workflows/pages.yml` deploys only).
Do: glob `test/*-browser.mjs`, make "no DISPLAY" a visible skip or delete the files. Confidence: high.

**7. 84.5% of `tasks/` is closed history and it is rotting.**
Evidence: 382 of 416 TASK.md closed, 38,616 of 45,693 lines; 5 of 10 sampled open tasks cite paths that no longer exist (`src/process-ffi.mjs`, `modules/zig.dm`, `demos/sdl2/sdl2.dm`, `rig/`, branch `codex/0ad-baseline-20260923`); 6 of 34 open tasks lack the State section the README requires; 28 share one State date (a sweep); `tasks/tags` has 155 tags, five of them "older spelling" aliases; design documents (gpu-01 `RESEARCH.md` + `ABI.md`, 501 lines) sit inside a closed task; 14 READMEs/docs link into closed tasks.
Do: remove closed tasks from the tree (git keeps them); drop the links; cap tags. Cost: 14 links. Confidence: high.

**8. 58% of tracked bytes are two videos and two posters.**
Evidence: `sites/slopshare.dev/agents/` 24.2 MB of 41.5 MB; sole consumer `scripts/package-domain.mjs:10`, one site. Do: host them outside the repository. Confidence: high.

**9. Two deployment targets, 1,834 lines, four places the image list lives.**
Evidence: 11 scripts + 3 tests + workflow + `docs/deployment.md`; `config/github-pages-images.txt` (12) is a strict subset of `domain-pages-images.txt` (51), both hand-kept, read only by `scripts/package-github-pages.mjs:12-14` and a test; the README description lines are the second list (`scripts/image-menu.mjs`), discovery of `Dollyfile*` the first. `deployment.md:81,106,130` says 67/71 images and three GitHub links; the closure is 102 and `domainOnlyApplications()` returns 14.
Do: one target; derive the published set from roles. Confidence: medium (owner's choice).

**10. `test/dolly.artifacts.mjs` (401 lines) re-asserts the build.**
Evidence: `validateRuntime`/`validateBrowserImports`/`validateProcess` already run in `scripts/build.sh:107,239,290,299,302`; snapshot identity in `build-system-snapshot.mjs:86`; lines 36-74 restate WAT type strings; 314-321 compare the generator's output with the same function that produced it; line 6 imports `spawnSync` unused. Unique and worth keeping: export set (140-151), import ownership (186-202), import blacklist (385-388).
Do: cut to those three. Confidence: medium-high.

**11. The suite tests wording, against the rule.**
Evidence: 102 `assert.rejects/throws` message regexes in `test/` (e.g. `cloudflare-pages.test.mjs:31,54-56,179-180`, `site-release.test.mjs:95-105`, `dollyfile-graph.test.mjs:25,82-84,122`); page prose in `custom-session-browser.mjs:222`, `default-browser.mjs:46`, `host-compute-browser.mjs:77`; `pages-publication.test.mjs:11-12` regexes over the workflow YAML; `dolly.artifacts.mjs:207-208` regexes over `src/kernel-plugin.mjs` source. Do: `{ code }` matchers and status checks. Confidence: high.

**12. Duplicate helpers.**
Evidence: `const run =` redefined in 16 core browser tests while `demos/browser.mjs:59` returns one; `demos/browser.mjs` (183) and `test/browser.mjs` (111) duplicate `openImage`/`pin`/`composed`; the sha256-hex one-liner appears in ~20 files; the podman/docker launcher four times (`build.sh:20-22,59-64`, `build-toolchain.sh:19-24`, `prepare-make.sh:44-49`); `fetch-make.sh`, `fetch-uucode.sh`, `fetch-zig.sh` redo `fetch-pinned-source.sh` (fetch-make's extraction is discarded at `prepare-make.sh:38-40`); `fail`/`response` identical in three providers. Do: one of each; ~300 lines. Confidence: high.

**13. Flags.**
Evidence: 25 environment variables; the build has two for one concept (`DOLLY_BUILD_IMAGES`, `DOLLY_SNAPSHOT_IMAGE`, set equal at `build-image.mjs:19-24`); 11 test switches (`DOLLY_IMAGE`, `DOLLY_BROWSER` honoured by two demos only, `DISPLAY`, `DOLLY_PYTHON_PACKAGES`, `DOLLY_LLM_*`, `DOLLY_RTS_*`), several gating a tail that passes silently when unset (`python-browser.mjs:106`, `rts-browser.mjs:20,38`). Do: fold the two build variables; make paid/live tests separate files. Confidence: medium.

**14. Stale and overlapping documents.**
Evidence (checked against code): `docs/architecture.md:107-129` image graph wrong on four counts (system copies no plugin, `default` is not FROM system, rust-sdk does install display); `browser-stack.md:45-48`, `process-model.md:71-74`, `browser-boundary.md:180` say processes enter via `WebAssembly.promising` where only a `dolly.process.stack` section does (`src/process-supervisor.mjs:171-183`, only the compiler: `compiler-main.c:8`); `slop.md:6` names a directive `COMPILEC` that `src/dollyfile.c` lacks; `gpu.md:11-12`, `display.md:8` old file names; `abi/README.md:16` omits operations 130-132, `:65` names an unbuilt `process-bin/ls`; `demos/README.md:28` links a deleted `sysroot` demo and omits `xonotic`; xonotic/rust/codex READMEs say "no file locks" (landed 85a01262); `licences.md:168` says 8 GPL files, line 25 and `git grep` say 10; README turnaround table 951 commits old. Overlaps: the boundary sentence ×4, the core-image list ×3, broker ×2, "32 images, 8 GiB" ×3, "ten seconds" ×4.
Do: delete architecture.md's Images section (README feeds the menu), fold browser-boundary's Network into http.md, delete demo "Key files" lists and `demos/README.md` (derivable). Pinning docs into an image buys offline docs for pi only; after finding 4 the cost is one package. Confidence: high.

**15. Hard constraints with no test.**
Evidence (`git grep` over test/): audio "grants no capture" none; "no host filesystem or subprocess" only by import names (`dolly.artifacts.mjs:385-388`); module reload none; forced Worker termination preserving kernel and shell none (only `fixtures/browser-process-abi.mjs:24` terminates). Do: ~40 lines in `threads-browser.mjs`/`boundary-browser.mjs`. Confidence: medium.

**16. The source suite is 19 s here, not 4-5 s.**
Evidence: 344 tests, 19.3 s; `test/slop.test.mjs` compiles Slop with ASan/UBSan each run (27 s case); `cloudflare-pages.test.mjs` export 9.2 s. Two tests crash at import without `dist/` (`process-abi.test.mjs:10`, `system-snapshot-format.test.mjs:6`). Do: cache the sanitizer binary by `slop.c` hash; move dist-dependent tests to `test:artifacts`. Confidence: high (one machine).

**17. Migration residue.**
Evidence: `.gitattributes:3` `*.dm` rule matches 0 files; `demos/python/Dollyfile-python:9` "pip.dm"; `.dm` names in `test/fixtures/dollyfile-syntax.mjs:81,208`, `demos/studio/test/studio-browser.mjs:26-27`; `Dollyfile:23` "no package holds them yet" while `Dollyfile-transfer` does; `patches/` (1 file) beside `config/*.patch` (6); `config/ghostty-source-manifest.txt` 541 lines, one commit, no generator; legacy store drop `src/image-artifact.mjs:199-203` and its test `image-browser.mjs:257-264`. Do: delete/merge. Confidence: high.

**18. Pin churn is the commit log.**
Evidence: 1,804 commits in 30 days; 102 touch ≥20 recipes; 83 change nothing outside `tasks/` but recipe pins. Finding 1 removes the release share; what remains is that a dependency rebuild rewrites every dependant's text (the Dollyfile auditor's domain). Confidence: high on counts.

## What is right and should stay

- The plan/reuse logic in `build-system-snapshot.mjs:93-126` is exact and explains every rebuild; `serve-checkout.mjs:37-67` refuses stale artifacts rather than testing them silently.
- Kernel C changes do not invalidate images: `write-build-id.mjs:8-11` keeps `dolly.wasm` out of the image build id.
- `scripts/` has no dead scripts: all 68 have callers; `host/*/module.json` is the single module registry and `build.sh` derives everything from it.
- `update-recipe-pins.mjs` re-parses to locate operands instead of regex-rewriting; `test/platform-documents.test.mjs` fails on a stale pin.
- `--reproducible` exists; it is the honest check for any coarser invalidation added above.