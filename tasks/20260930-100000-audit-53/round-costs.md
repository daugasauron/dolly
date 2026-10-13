# What a catalog round costs: the measurements that exist

Read-only, from `work/rust` at `9d181464` (2026-10-14). Nothing was built or run; every figure below is copied from a log or a task, or is arithmetic over those figures, with the file named.

Checked by the integrator (2026-10-14, 06:00) and corrected here:

- The tree has 130 recipes, not 129: the root `Dollyfile` (`default`) is not in the table of section 2. It builds in 6.3 s (`build/night-1014/image.log`), so the sums below are 6 s low and "129" reads 130 throughout.
- Recomputed from the table: 123 durations summing to 18,469 s by the table's rounded figures (the text says 18,460 s), the ten longest 13,257 s, the twenty longest 15,479 s; 34 rows under 10 s by the rounded figures where the text says 37; 88 under 60 s, 110 under 300 s, six over 1,000 s.
- Five durations read in the logs: `mojo-llvm` 2,730.4 s, `rust-build` 1,718.6 s, `codex-build` 1,769.4 s, `cmake-build` 1,074.9 s, `zero-ad-spidermonkey` 858.2 s. The chain of 3.1 adds up to 6,536 s.
- The README's "17 min" for the core tests (`85e3cecc`, 2026-10-13 11:59) was measured 96 minutes before the suite began to run four files side by side (`d08dca57`, 13:35). Every run since took 403 to 427 s. The README says so now.

## Summary

- Per-image build durations exist for 123 of the 129 recipes at HEAD (`qwen3.5-4b` and its four shards left on 10-14, so 129, not 130). The reliable figure is the coordinator's `dolly: packaged N byte NAME snapshot (…) in Xs` row (`scripts/build-system-snapshot.mjs:141-170`: one image's whole `produce`, browser start to packed snapshot); it is printed in the catalog logs, not in `build/image-logs/NAME.log`, which carry only `exported N byte` and, for 11 images, `time` rows.
- Sum of the 123 single-build durations: 18,460 s (5.1 h). The ten longest sum to 13,257 s (72%); the twenty longest to 15,478 s (84%). 37 images build in under 10 s, 88 in under 60 s, 110 in under 300 s.
- The longest dependency chain by time is 6,536 s (1 h 49 min): system-build → zig-build → ghostty-build → display → system-tools → cmake-build → rust-llvm → rust-build → protox → codex-build → codex. The v0.1.2 round measured exactly this chain alone, one job: 6,765 s wall for 17 images (`build/v012-evidence/catalog-codex.log`).
- Full rounds measured: v0.1.1 (10-09) build stages 3 h 50 min; v0.1.2 (10-11) build stages 3 h 40 min, whole round 5 h 36 min with tests 1 h 16 min and publishing 37 min; 10-13 build stages 5 h 02 min including two failed heavy attempts, tests 66 min.
- Side-by-side building lengthens the heavy images: rust-build took 2,940 s beside mojo-llvm on 10-13 against 1,719 s alone on 10-11; rust-llvm 1,726 s against 1,246 s; llvm-build 2,595 s against 2,341 s; mojo-llvm 4,065 s against 2,730 s.
- The night of 10-14: 21 images (the `pi` family after `default`) in 618 s wall, of which 143 s source preparation and 469 s snapshots over 3 lanes, the images summing to 626 s; then 4 images (the `dolly-docs` chain) in 476 s wall for 253 s of chained builds.
- Tests in a round: source 21 s, artifacts 32 s, the core browser suite 404–414 s in both browsers (951 s on 10-11), the demo suites 36–41 min, the GPU checks 18–23 min. On 10-13 tests were 66 min against 5 h of building; on the night of 10-14 tests were 60 min against 10 min of building.

## 1. The measurements that exist

### 1.1 Recorded in tasks

| Date | Figure | What it measured | Source |
| --- | --- | --- | --- |
| 2026-10-01 | 1 h 53 min wall; 10,542 s (2 h 56 min) summed | forced full rebuild of 39–41 images, `DOLLY_IMAGE_JOBS=3`, load 16–20 on 16 cores (other agents building); codex-build 5,310 s under that load, 3,980 s the night before; peak PSS codex-build 16.6 GB, others ≤ 5 GB | `tasks/20260930-231102-parallel-images/TASK.md` "Measured" |
| 2026-10-01 | 48 min wall against "about 3.5 h serially" | release candidate's 41 images, `DOLLY_IMAGE_JOBS=4` | same task, "Closed" |
| 2026-10-01 | 9.5–11 min at N=3 against 12–13 min serial | the 8 core images from a new seed | same task, "Use on next" |
| 2026-10-06 | 2 s (`default`, nothing changed); catalog preparation 53.9 s | unchanged-image turnaround after the iteration work | `tasks/20260930-100000-audit-53/TASK.md` "Measured after" |
| 2026-10-06 | `cmake-build` 24 min 17 s, one job | a serial chain through `work/build-slot.sh` | `tasks/20261006-111835-dso-module/TASK.md:275` |
| 2026-10-07 | 27 images in 54 min 45 s | one builder, while another agent ran | `tasks/20261007-074904-sockets-module/TASK.md:396` |
| 2026-10-09 (v0.1.1) | all 80 images; rustc 8 min 33 s, std 51 s, rustc again 9 min 10 s, Cargo 9 min 10 s, Codex 29 min 58 s | the inner `time` rows of `rust-build` and `codex-build` in that round; core suite 916 s | `tasks/20261009-185407-v011/TASK.md:39-49` |
| 2026-10-11 (v0.1.2) | "5.5 h" / "5 h 36 min"; "103 images through ≤6 lanes" | the whole checkpoint round, seed to published site; jobs capped by `freemem/10 GiB` | `tasks/20261012-230015-audit-fable/TASK.md:25`, `hygiene.md:35,45` |
| 2026-10-13 | "8 of the first 11 serial minutes" are Zig and Ghostty | the core chain to `default`: see 3.1 | `tasks/20261012-230015-audit-fable/TASK.md:84` |
| 2026-10-13 | 888 s for `default`, `cc`, `git`, `less` (15 images); 17 min core tests in both browsers | README turnaround table | `README.md:88-95` |
| 2026-10-13 | three new JavaScript images 14.9 s, 4.1 s, 5.2 s; `amy-browser.mjs` 4 min 10 s for both browsers | on a catalog of 103 images | `tasks/20261013-135951-javascript-split/TASK.md:145` |

Two different numbers exist for the core browser suite on 10-13: the README's "17 min" and the round's `browser.log` "all passed in 407s" (54 test files, both browsers, 107 pass lines). I report the log; the README's provenance is not in the logs.

### 1.2 Earlier rounds in `build/` (same machine, 16 cores, 60 GB)

| Round | Stage | Jobs | Images built | Wall | Snapshots phase | Evidence |
| --- | --- | ---: | ---: | --- | --- | --- |
| round3, 10-07 | light | 3 | 58 | 3,632 s | | `build/round3-evidence/catalog-light.log` |
| round3, 10-07 | heavy | 2 | 9 | 1,190 s | | `round3-evidence/catalog-heavy.log` |
| round3, 10-06/07 | three chains | 1, 1, 2 | 13, 13, 13 | 775 s, 835 s, 643 s | | `round3-evidence/image-chain-{1,2}.log`, `chain3-images.log` |
| v0.1.1, 10-09 | codex chain alone | 1 | 17 | 7,073 s (18:54–20:52) | | `build/release-evidence/catalog-codex.log`, `round.log` |
| v0.1.1 | light | 3 | 50 of 67 | 2,587 s (20:52–21:35) | | `release-evidence/catalog-light.log` |
| v0.1.1 | heavy | 1 | 13 | 4,132 s (21:35–22:44) | | `release-evidence/catalog-heavy.log` |
| v0.1.1 | browser suite | | | 916 s; demos 34 min, failed (Xonotic recording) | | `release-evidence/round.log` |
| v0.1.2, 10-11 | seed | | | 02:22–02:25 | | `build/v012-evidence/round.log` |
| v0.1.2 | codex chain alone ("20 GB at its peak") | 1 | 17 | 6,765 s (02:25–04:17) | 6,687 s | `v012-evidence/catalog-codex.log` |
| v0.1.2 | light | 3 | 53 of 70 | 2,538 s (04:17–05:00) | 2,361 s (images summing to 4,593 s) | `v012-evidence/catalog-light.log` |
| v0.1.2 | heavy | 1 | 13 | 3,928 s (05:00–06:05) | 3,769 s (images summing to 3,508 s) | `v012-evidence/catalog-heavy.log` |
| v0.1.2 | source, artifacts | | | 06:05 (424/0, 25/0) | | `v012-evidence/round.log` |
| v0.1.2 | browser suite | | | 951 s (06:06–06:22) | | |
| v0.1.2 | demos | | | 41 min (06:22–07:03) | | |
| v0.1.2 | GPU | | | 18 min (07:03–07:21) | | |
| v0.1.2 | publish, domain publish | | | 18 min + 18 min (07:21–07:57) | | |

v0.1.2 whole: 02:22–07:58 = 5 h 36 min; of it 3 h 40 min building 83 images (summing 14,751 s = 4.1 h of single-build time), 1 h 16 min tests, 37 min publishing. Each catalog stage also spends "source preparation and pinning" before any image: 77 s, 176 s, 153 s in the three stages.

### 1.3 The round of 2026-10-13 (`build/round-1013-evidence/`)

Stages from `round-seed.log`, `round-first.log`, `round-second.log`, `round.log` (= `round-third.log`), `round-gpu.log`; which images each stage built from the mtimes of `build/image-logs/NAME.log` and the lane in each log's first line.

| Time | Stage | Jobs | What | Wall |
| --- | --- | ---: | --- | --- |
| 10:46–11:01 | preflight: runtime, `default` | 2 | 19 images (`preflight-image.log`: system-build 66.5 s, zig-build 480.4, ghostty-build 62.8, system-tools 105.2, python 120.9, …) | 893 s |
| 11:01–11:37 | preflight 2 | 3 | 28 images (`preflight2-image.log`: zig-build 419.7, system-tools 98.0, python 107.7, typescript-build 38.4, tmux 25.1, …) | 793 s |
| 11:19–11:23 | runtime and Rust seed | | | 4 min |
| 11:40–13:59 | "codex-build (20 GB at its peak) and mojo-build (9 GB) first, side by side" | 2 | lane 0: cmake-build (done 12:02), mojo-llvm (13:11, `time` 4,065 s), mojo-build (13:30, 1,062 s); lane 1: rust-sdk (11:42), rust-llvm (12:02–12:31, 1,726 s), rust-build (12:31–13:20, ≈2,940 s), protox (13:23), codex-build (13:23–13:59, ≈2,160 s) | 139 min |
| 13:59–14:48 | light: 116 images | 3 | 56 built by the mtimes (14:01–14:48; last: zero-ad-spidermonkey 14:41, zero-ad-engine 14:48, wine-build 14:30); the rest cached from the preflights | 49 min |
| 14:48–15:57 | heavy, failed | 1 | qwen3.5-2b 14:53, llama 14:59, llvm-build 15:43 (`time` 2,595 s), llvm-cc, llvm 15:47, minicpm5-2b 15:49, qwen3.5-4b-1..4 and qwen3.5-4b 15:51–15:55, xonotic 15:56; then a Node error (the failing log was overwritten by the rerun) | 69 min |
| 15:59–16:00 | codex, mojo cached | 2 | 0 built | 79 s |
| 16:00–16:05 | light rerun: 120 images | 3 | 29 built (the `tools-build` family: wabt 60.1 s, sqlite 31.2, dte 30.3, tmux 28.1, …, summing to 441 s; snapshots phase 189 s) | 297 s |
| 16:05–16:13 | heavy, failed again | 1 | | 8 min |
| 16:15–16:21 | heavy | 1 | zero-ad 153.6 s (`catalog-heavy.log`; preparation 136 s) | 353 s |
| 16:21 | source 430/0 (21 s); artifacts 24/1 (32 s) | | | 53 s |
| 16:22–16:28 | core browser suite, Chromium and Firefox | | 54 files × 2 | 407 s |
| 16:28–17:04 | demo suites | | 27 passed, 4 skipped | 36 min |
| 17:04–17:27 | GPU: local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics, slopyard (done 17:23), mojo gpu (17:27) | | | 23 min |
| 17:31, 18:09 | later fixes: 3 images in 213 s (`overlay-image.log`); 8 images in 519 s (`sdk-image.log`: pi-local 120.5, dollyfile-studio 116.5, mojo-gpu 40.6, …) | 3, 2 | | |

Seed start to the heavy stage's success: 11:19–16:21 = 5 h 02 min, of which 77 min were the two failed heavy attempts (the first did 65 min of real building that the rerun reused). The preflights before it: 51 min.

## 2. Image by image

Duration: the latest `packaged … in Xs` row for the image across every log under `build/` (783 rows in 25 logs; the latest per image is from `v012-evidence/catalog-*.log` for 39 images, `round-1013-evidence/catalog-light.log` 25, `preflight2-image.log` 21, `night-1014/image.log` 16, `integrate-evidence/packages-image.log` 11, `night-1014b/image.log` 4, `sdk-image.log` 4, three single-image logs). Snapshot size: the `exported N byte` line of `build/image-logs/NAME.log` (all 129 present). Direct base: the recipe's `FROM`. Dependents: images whose `FROM`, `INSTALL` or `COPY` closure contains this one, counted by me over the 306 edges of the 129 recipes at HEAD (`awk` over `^(FROM|INSTALL|COPY)` rows); they agree with the builds-root investigation's section 3 minus `qwen3.5-4b` (system-build 125 vs 126, system-tools 112 vs 113, display 114 vs 115, cmake-build 82 vs 82, zig-build 117 vs 118). `time` rows: for the 11 logs that have them, count, sum and largest `real` (these are of the 10-13 builds, not necessarily the same build as the duration column).

Conditions column: "1j alone" = v0.1.2's one-job codex or heavy stage, 10-11; "3j" = a three-lane stage (v0.1.2 light 10-11, preflight 2 or the light rerun 10-13, night-1014); "2j" = sdk-image 10-13 or night-1014b; "pkg" = `integrate-evidence/packages-image.log` 10-13 00:22; "int" = `integrate-evidence/mojo-*.log` 10-13 05:17/05:28.

| # | Image | s | When, conditions | FROM | Dependents | Snapshot MB | `time` rows (n, sum, max) |
| ---: | --- | ---: | --- | --- | ---: | ---: | --- |
| 1 | mojo-llvm | 2730 | 10-13 05:17 int | cmake-build | 3 | 731.4 | 4, 4065, 3925 (13:11, beside codex) |
| 2 | llvm-build | 2341 | 10-11 06:05 1j | llvm-tablegen | 2 | 594.3 | 3, 2595, 2502 (15:43) |
| 3 | codex-build | 1769 | 10-11 04:17 1j | rust-build | 2 | 361.6 | |
| 4 | rust-build | 1719 | 10-11 04:17 1j | rust-sdk | 24 | 514.1 | |
| 5 | rust-llvm | 1246 | 10-11 04:17 1j | cmake-build | 25 | 428.0 | 3, 1726, 1657 (12:31, beside mojo-llvm) |
| 6 | cmake-build | 1075 | 10-11 04:17 1j | system-tools | 82 | 239.2 | |
| 7 | zero-ad-spidermonkey | 858 | 10-11 05:00 3j | zero-ad-deps | 2 | 873.9 | 1, 865, 865 |
| 8 | mojo-build | 668 | 10-13 05:28 int | mojo-llvm | 2 | 831.1 | 4, 1062, 1011 (13:30) |
| 9 | llvm-tablegen | 431 | 10-11 05:00 3j | cmake-build | 3 | 333.5 | 4, 534, 196 |
| 10 | zig-build | 420 | 10-13 11:37 3j | system-build | 117 | 187.9 | |
| 11 | wine-build | 316 | 10-11 05:00 3j | system-tools | 1 | 307.3 | |
| 12 | zero-ad-engine | 311 | 10-11 05:00 3j | zero-ad-deps | 1 | 479.2 | 2, 310, 310 |
| 13 | llama-build | 306 | 10-11 05:00 3j | cmake-build | 4 | 260.6 | |
| 14 | neovim-build | 232 | 10-11 05:00 3j | cmake-build | 4 | 279.7 | |
| 15 | zero-ad-deps | 225 | 10-11 05:00 3j | openal-build | 10 | 418.2 | 1, 284, 284 |
| 16 | llvm-cc | 215 | 10-11 06:05 1j | llvm-build | 1 | 643.1 | 2, 168, 159 |
| 17 | sdl2 | 169 | 10-11 05:00 3j | cmake-build | 16 | 3.8 | |
| 18 | zero-ad | 160 | 10-13 17:45 alone | (none; INSTALLs) | 0 | 1930.3 | |
| 19 | openal-build | 153 | 10-11 05:00 3j | cmake-build | 12 | 242.6 | |
| 20 | minicpm5-2b | 135 | 10-11 06:05 1j | system | 0 | 1561.4 | |
| 21 | qwen3.5-2b | 126 | 10-11 06:05 1j | system | 2 | 1396.3 | |
| 22 | rts-build | 120 | 10-11 05:00 3j | system-tools | 1 | 269.5 | |
| 23 | xonotic-build | 117 | 10-11 05:00 3j | system-tools | 1 | 189.4 | |
| 24 | dollyfile-studio | 116 | 10-14 02:25 2j | pi-local | 0 | 1672.8 | |
| 25 | pi-local | 115 | 10-14 02:25 2j | pi-agent | 1 | 1636.4 | |
| 26 | python | 108 | 10-13 11:37 3j | system | 35 | 47.2 | |
| 27 | cbindgen | 104 | 10-11 05:00 3j | rust-build | 3 | 5.0 | |
| 28 | speech-build | 100 | 10-11 05:00 3j | cmake-build | 4 | 246.9 | |
| 29 | system-tools | 98 | 10-13 11:37 3j | system-build | 112 | 151.0 | |
| 30 | fd | 91 | 10-11 05:00 3j | rust-build | 12 | 5.6 | |
| 31 | xonotic | 83 | 10-11 06:05 1j | system | 0 | 1103.3 | |
| 32 | ripgrep | 78 | 10-11 05:00 3j | rust-build | 13 | 6.1 | |
| 33 | protox | 77 | 10-11 04:17 1j | rust-build | 3 | 3.9 | |
| 34 | llvm-runtimes | 66 | 10-11 05:00 3j | system-tools | 0 | 11.3 | 1, 107, 107 |
| 35 | wabt | 60 | 10-13 16:05 3j | tools-build | 0 | 6.6 | |
| 36 | pi-build | 57 | 10-14 00:53 3j | system-tools | 10 | 242.6 | |
| 37 | ghostty-build | 54 | 10-13 11:37 3j | zig-build | 115 | 199.4 | |
| 38 | emacs | 54 | 10-11 05:00 3j | system | 1 | 141.2 | |
| 39 | slopyard | 53 | 10-14 00:53 3j | gamedev-sdk | 0 | 257.4 | |
| 40 | gamedev-sdk | 50 | 10-11 05:00 3j | system | 4 | 172.4 | |
| 41 | system-build | 45 | 10-13 11:37 3j | (seed) | 125 | 127.3 | |
| 42 | rust | 41 | 10-11 05:00 3j | (none; INSTALLs) | 5 | 336.8 | |
| 43 | rust-sdk | 41 | 10-11 04:17 1j | system-build | 25 | 418.9 | |
| 44 | mojo-gpu | 41 | 10-13 18:09 2j | system | 0 | 252.0 | |
| 45 | rust-tools | 39 | 10-11 05:00 3j | system | 0 | 524.5 | |
| 46 | classicube-build | 39 | 10-11 05:00 3j | system-tools | 1 | 165.3 | |
| 47 | cargo | 38 | 10-11 05:00 3j | (none) | 4 | 36.9 | |
| 48 | rts-arena | 37 | 10-14 00:53 3j | pi-runtime | 0 | 355.1 | |
| 49 | pi-phone | 32 | 10-14 00:53 3j | pi-runtime | 0 | 368.4 | |
| 50 | sqlite | 31 | 10-13 16:05 3j | tools-build | 0 | 5.5 | |
| 51 | dte | 30 | 10-13 16:05 3j | tools-build | 0 | 0.8 | |
| 52 | bhop | 29 | 10-14 00:53 3j | gamedev-sdk | 0 | 257.2 | |
| 53 | local-llm-build | 29 | 10-11 05:00 3j | llama-build | 3 | 271.5 | |
| 54 | codex | 28 | 10-11 05:00 3j | system | 1 | 209.6 | |
| 55 | tmux | 26 | 10-14 00:53 3j | tools-build | 1 | 2.0 | |
| 56 | classicube | 25 | 10-14 00:53 3j | pi-runtime | 0 | 237.0 | |
| 57 | speech-to-text | 24 | 10-13 00:22 pkg | speech-build | 1 | 5.2 | |
| 58 | mojo | 23 | 10-13 18:09 2j | (none) | 1 | 101.1 | |
| 59 | llvm | 22 | 10-11 06:05 1j | (none) | 0 | 127.4 | |
| 60 | gpu-fluid | 21 | 10-13 18:09 2j | system | 0 | 151.7 | |
| 61 | parakeet | 21 | 10-13 00:22 pkg | (none) | 4 | 135.4 | |
| 62 | quickjs | 20 | 10-14 00:53 3j | system-tools | 14 | 3.0 | |
| 63 | wine | 20 | 10-11 05:00 3j | system | 0 | 191.7 | |
| 64 | gnu-emacs | 20 | 10-11 05:00 3j | system | 0 | 292.1 | |
| 65 | pi-runtime | 19 | 10-14 00:53 3j | system | 6 | 229.1 | |
| 66 | voice | 19 | 10-13 00:22 pkg | speech-build | 1 | 4.0 | |
| 67 | cmake | 19 | 10-11 05:00 3j | cmake-build | 0 | 87.8 | |
| 68 | pi-agent | 17 | 10-14 02:25 2j | pi-runtime | 2 | 229.4 | |
| 69 | jq | 17 | 10-13 16:05 3j | tools-build | 0 | 1.4 | |
| 70 | tools-build | 17 | 10-13 16:05 3j | cmake-build | 25 | 239.9 | |
| 71 | xz | 16 | 10-13 16:05 3j | tools-build | 0 | 1.0 | |
| 72 | neovim | 16 | 10-13 16:05 3j | system | 0 | 187.3 | |
| 73 | meson | 16 | 10-13 16:05 3j | tools-build | 0 | 4.5 | |
| 74 | closed-source-agent | 15 | 10-14 00:53 3j | system | 0 | 161.7 | |
| 75 | system | 15 | 10-13 11:37 3j | system-tools | 51 | 151.0 | |
| 76 | mojo-runtime | 14 | 10-13 18:09 2j | system | 2 | 152.3 | |
| 77 | zstd | 14 | 10-13 16:05 3j | tools-build | 0 | 2.0 | |
| 78 | sbase | 14 | 10-13 16:05 3j | tools-build | 0 | 0.5 | |
| 79 | mandoc | 13 | 10-13 16:05 3j | system-tools | 26 | 0.9 | |
| 80 | tmux-panes | 13 | 10-14 00:53 3j | system | 0 | 153.5 | |
| 81 | nvim | 12 | 10-13 16:05 3j | tools-build | 2 | 36.4 | |
| 82 | tar | 12 | 10-13 16:05 3j | tools-build | 0 | 0.2 | |
| 83 | bc | 12 | 10-13 16:05 3j | tools-build | 0 | 0.7 | |
| 84 | cc | 11 | 10-13 11:37 3j | system-build | 38 | 126.2 | |
| 85 | pi | 11 | 10-14 00:53 3j | system | 9 | 62.3 | |
| 86 | less | 10 | 10-13 11:37 3j | system-tools | 0 | 0.6 | |
| 87 | freetype | 10 | 10-13 00:22 pkg | zero-ad-deps | 0 | 1.9 | |
| 88 | pkgconf | 10 | 10-13 00:22 pkg | zero-ad-deps | 0 | 0.3 | |
| 89 | yacc | 10 | 10-13 16:05 3j | tools-build | 1 | 0.3 | |
| 90 | unzip | 9 | 10-13 16:05 3j | tools-build | 1 | 0.4 | |
| 91 | flex | 9 | 10-13 16:05 3j | tools-build | 0 | 0.5 | |
| 92 | toybox | 9 | 10-13 16:05 3j | system-tools | 0 | 0.3 | |
| 93 | zip | 9 | 10-13 16:05 3j | tools-build | 0 | 0.5 | |
| 94 | libpng | 9 | 10-13 00:22 pkg | zero-ad-deps | 1 | 0.8 | |
| 95 | zlib | 8 | 10-13 11:37 3j | system-build | 115 | 0.3 | |
| 96 | lz4 | 8 | 10-13 16:05 3j | tools-build | 0 | 0.7 | |
| 97 | tree | 8 | 10-13 16:05 3j | tools-build | 0 | 0.3 | |
| 98 | bzip2 | 8 | 10-13 16:05 3j | tools-build | 0 | 0.4 | |
| 99 | lua | 7 | 10-13 16:05 3j | tools-build | 0 | 3.3 | |
| 100 | zig | 7 | 10-13 11:37 3j | zig-build | 0 | 60.6 | |
| 101 | libevent | 7 | 10-13 11:37 3j | system-tools | 2 | 0.6 | |
| 102 | typescript | 7 | 10-14 00:53 3j | system-tools | 11 | 25.1 | |
| 103 | libterminfo | 6 | 10-14 00:53 3j | system-tools | 2 | 0.3 | |
| 104 | pigz | 6 | 10-13 16:05 3j | tools-build | 0 | 0.4 | |
| 105 | xxd | 6 | 10-13 16:05 3j | tools-build | 0 | 0.2 | |
| 106 | display | 5 | 10-13 11:37 3j | (none; COPY from ghostty-build) | 114 | 9.4 | |
| 107 | libuv | 5 | 10-13 00:22 pkg | cmake-build | 0 | 0.6 | |
| 108 | curl | 5 | 10-13 11:37 3j | system-build | 114 | 0.4 | |
| 109 | janis | 5 | 10-14 00:53 3j | system-tools | 13 | 1.8 | |
| 110 | dolly-docs | 5 | 10-14 02:25 2j | (none) | 3 | 0.2 | |
| 111 | ps | 5 | 10-14 00:53 3j | (none) | 0 | 0.004 | |
| 112 | session-recover | 4 | 10-13 00:22 pkg | system | 0 | 0.2 | |
| 113 | box3d | 4 | 10-13 00:22 pkg | gamedev-sdk | 0 | 2.2 | |
| 114 | gzip | 4 | 10-13 11:37 3j | system-build | 114 | 0.2 | |
| 115 | nena | 3 | 10-13 11:37 3j | system-build | 0 | 0.1 | |
| 116 | make | 3 | 10-13 00:22 pkg | system-build | 0 | 0.5 | |
| 117 | posix | 3 | 10-13 11:37 3j | system-tools | 25 | 3.3 | |
| 118 | git | 3 | 10-13 11:37 3j | system-tools | 0 | 10.1 | |
| 119 | raylib | 3 | 10-13 00:22 pkg | gamedev-sdk | 0 | 1.9 | |
| 120 | amy | 3 | 10-13 11:37 3j | system-tools | 0 | 0.3 | |
| 121 | core | 2 | 10-13 11:37 3j | system-build | 1 | 1.0 | |
| 122 | ninja | 2 | 10-13 11:37 3j | system-tools | 36 | 0.3 | |
| 123 | transfer | 2 | 10-13 11:37 3j | system-tools | 1 | 0.2 | |
| – | base64 | ? | last built 10-13 14:01 | system-tools | 0 | 0.2 | |
| – | codex-agent | ? | 10-13 14:06 | system | 0 | 371.8 | |
| – | llama | ? | 10-13 14:59 | local-llm-build | 0 | 11.0 | |
| – | openal | ? | 10-13 14:19 | openal-build | 0 | 3.5 | |
| – | speech-to-text-mic | ? | 10-13 14:23 | system | 0 | 291.5 | |
| – | vi | ? | 10-13 14:24 | system-tools | 0 | 0.4 | |

`default` (the root `Dollyfile`) is missing from the table: 6.3 s (10-14 00:53, 3j; 5.5 s and 5.7 s in the preflights), no `FROM`, eight `INSTALL` rows, 2 dependents, 14 MB.

The six without a duration were built in the 13:59–14:48 light stage of 10-13, whose coordinator log was overwritten by the 16:00 rerun (`round-1013-evidence/catalog-light.log` holds the rerun's 29 rows).

**Groups.** Ten longest: mojo-llvm 2,730; llvm-build 2,341; codex-build 1,769; rust-build 1,719; rust-llvm 1,246; cmake-build 1,075; zero-ad-spidermonkey 858; mojo-build 668; llvm-tablegen 431; zig-build 420 = 13,257 s of 18,460 s (72%). Under 10 s: 37 images; under 60 s: 88; under 300 s: 110; over 1,000 s: 6. The 129 snapshots sum to 26.2 GB; the seven over 1 GB (zero-ad 1.93, dollyfile-studio 1.67, pi-local 1.64, minicpm5-2b 1.56, qwen3.5-2b 1.40, xonotic 1.10 GB) are 9.3 GB of it.

## 3. The chain's shape in time

### 3.1 The longest chain

Node-weighted longest path over the FROM/INSTALL/COPY graph with the table's durations (`awk`, memoised DFS):

system-build 45 → zig-build 420 → ghostty-build 54 → display 5 → system-tools 98 → cmake-build 1,075 → rust-llvm 1,246 → rust-build 1,719 → protox 77 → codex-build 1,769 → codex 28 = **6,536 s (1 h 49 min)** at one build at a time, unloaded. That is the least a full round takes whatever the job count. The measured one-job run of this chain (v0.1.2's codex stage, 17 images including rust-sdk, system, python, zlib, gzip, curl, posix beside the path) was 6,765 s wall, 6,687 s in the snapshots phase, the 17 images summing to 6,650 s. On 10-13, with mojo-llvm in the other lane, lane 1 took 139 min (11:40–13:59) for the same path from rust-sdk on.

The first 11 serial minutes of it (to `default`): system-build 45 + zig-build 420 + ghostty-build 54 + display 5 + system-tools 98 + system 15 + default 6 = 643 s; zig-build and ghostty-build are 474 s of that (the "8 of the first 11 minutes" of `audit-fable/TASK.md:84`).

What runs beside the chain once cmake-build is done (each a chain of its own, from cmake-build's end at 1,697 s):

| Side chain | Images | Its own length | Ends at (from the round's start, unloaded, unlimited jobs) |
| --- | --- | ---: | ---: |
| Mojo | mojo-llvm 2,730 → mojo-build 668 → mojo-runtime 14 → mojo 23 | 3,435 s | 5,132 s |
| LLVM | llvm-tablegen 431 → llvm-build 2,341 → llvm-cc 215 → llvm 22 | 3,009 s | 4,706 s |
| 0 A.D. | openal-build 153 → zero-ad-deps 225 → zero-ad-spidermonkey 858 → zero-ad-engine 311 → zero-ad 160 | 1,707 s | 3,404 s |
| Rust tools (after rust-build at 4,739 s) | fd 91, ripgrep 78, cbindgen 104, protox 77 → pi-coding-agent-less `pi` family | | |
| Studio (from system at 1,712 s) | pi-build 57 → pi 11 → pi-runtime 19 → pi-agent 17 → pi-local 115 → dollyfile-studio 116 | 335 s | |
| Everything else | 100 images of under 60 s each, mostly from tools-build (26 images, 500 s in all) and system-tools | | |

So with the Codex chain at 6,536 s and the Mojo chain at 5,132 s, two lanes of heavy work overlap for most of the round, and in the measured rounds they overlapped at 2 jobs (10-13) or ran serially at 1 (10-11): 6,765 s + 3,928 s there.

### 3.2 Jobs and what limited them

`scripts/build-system-snapshot.mjs:29-31`: default jobs = min(cores, freemem / 10 GiB), the comment noting "most peak below 5 GB, the largest catalog image at 17 GB (PSS, measured 2026-10-01)". The rounds set it explicitly: the round scripts (`/home/daug/dev/dolly/work/round-next.sh:37,45`) run the light stage at `DOLLY_IMAGE_JOBS=3` and the heavy stage at 2, the codex stage alone (the 10-13 log shows the heavy stage at 1 and the codex stage at 2 with mojo-build beside it). The reason is in the script's header: "The heavy images (pi-local, dollyfile-studio, zero-ad, the model packages) build after the Codex chain: beside codex-build's renderer (14.5 GB and growing) they exceeded the cap at 20:36." The caps are `work/slot.sh`: a build slot is a systemd scope with `MemoryMax=6G` (`bigbuild` 9G "cargo needs 6 GB in its last crate"; `hugebuild` 24G "images whose build runs four rustc at once (rust-build, codex-build)"), browsers 6G, no swap. The 10-13 round log names codex-build at 20 GB peak and mojo-build at 9 GB. Measured 10-01: codex-build 16.6 GB PSS while exporting, all others ≤ 5 GB.

Load effect on the heavy images, same recipe, two dates:

| Image | Alone, 1 job (10-11) | Beside another heavy build (10-13 `time` rows) |
| --- | ---: | ---: |
| rust-llvm | 1,246 s | 1,726 s (+39%) |
| rust-build | 1,719 s | ≈2,940 s by lane timing (+71%) |
| codex-build | 1,769 s | ≈2,160 s by lane timing (+22%) |
| llvm-build | 2,341 s | 2,595 s (+11%, 1 job but demo tests not yet running) |
| mojo-llvm | 2,730 s (10-13 05:17) | 4,065 s (+49%) |

### 3.3 The night of 2026-10-14

`build/night-1014/status.log`, `image.log` (3 jobs): 21 images in 618.1 s wall = source preparation and pinning 143 s + inspection 14 s + snapshots 469 s. The images: ps 4.7, dolly-docs 8.0, default 6.3, libterminfo 6.4, quickjs 20.1, janis 5.0, typescript 6.7, closed-source-agent 14.9, tmux 25.7, tmux-panes 12.7, pi-build 57.1, pi 10.6, pi-runtime 19.4, bhop 29.1, classicube 24.5, pi-agent 19.2, slopyard 52.5, pi-phone 32.1, rts-arena 36.7, pi-local 118.9, dollyfile-studio 114.9 = 626 s of builds over three lanes; the chain inside the set pi-build → pi → pi-runtime → pi-agent → pi-local → dollyfile-studio = 340 s, so the snapshots phase (469 s) is 1.4 times the chain and 0.75 of the sum.

`build/night-1014b/status.log`, `image.log` (2 jobs): 4 images in 475.9 s wall = preparation 134 s + inspection 19 s + snapshots 336 s; the images are one chain, dolly-docs 4.8 → pi-agent 16.9 → pi-local 114.9 → dollyfile-studio 116.3 = 253 s; the 83 s between the chain and the snapshots phase is the per-image browser restart and cache check that the `packaged` row does not include. This is the "a docs file: 4 images" case measured.

`build/night-1014c/status.log`: no image build; tests only.

## 4. What a change of each kind costs, as arithmetic over the table

Method: for a recipe X, the set is X plus every image whose FROM/INSTALL/COPY closure contains X (the same closure the builds-root investigation counted; the seed makes all stale through the image build ID, `build-system-snapshot.mjs:98`). "Sum" adds the table's single-build durations of the set (missing images count 0; the six without a duration are leaves of under a minute by their size class, except codex-agent and speech-to-text-mic whose snapshot sizes resemble 15–30 s images). "Chain" is the longest node-weighted path starting at X inside the set: the least wall time of that rebuild with unlimited jobs and no load. Preparation (75–176 s per catalog stage) and tests are on top.

| Change | Repinned (investigation) | Set at HEAD | Sum of builds | Longest chain | Chain's images |
| --- | ---: | ---: | ---: | ---: | --- |
| a seed file (header, client, WAT, `dollyfile.c`, the compiler) | all 130 | 129 | 18,460 s (5.1 h) | 6,536 s (1 h 49 min) | the full chain of 3.1 |
| a root command or Slop (`system-build`) | 127 | 126 | 18,430 s | 6,536 s | same |
| `zig.tar` (`zig-build`) | 119 | 118 | 18,348 s | 6,491 s | from zig-build |
| `ghostty.tar` (`ghostty-build`) | 117 | 116 | 17,921 s | 6,071 s | from ghostty-build |
| `zlib.tar` | 117 | 116 | 17,873 s | 6,024 s | zlib → gzip → system-tools → … |
| `display` (Ghostty's `display.c`) | 115 | 115 | 17,866 s | 6,017 s | display → system-tools → … |
| `gzip.c`, `libcurl-fetch.c` | 116 | 115 | 17,865 s | 6,015 s | |
| anything of `system-tools` (amy, xargs, sbase, awk, Samurai, Git's patch) | 114 | 113 | 17,820 s | 6,012 s | system-tools → cmake-build → … |
| `cmake-build` (libuv, CMake) | 83 | 83 | 16,959 s | 5,914 s | cmake-build → rust-llvm → … |
| `system` (`session-recover.c`) | 52 | 52 | 14,195 s | 4,961 s | system → python → rust-llvm → … |
| `cc`'s recipe | | 39 | 13,658 s | 4,957 s | cc → python → … |
| `python`'s pin | | 36 | 13,621 s (3.8 h) | 4,946 s | python → rust-llvm 1,246 → rust-build 1,719 → protox → codex-build 1,769 → codex |
| `rust-build` | | 25 | 5,781 s | 3,592 s | rust-build → protox → codex-build → codex |
| `tools-build` | | 26 | 500 s | 145 s | tools-build → nvim → dollyfile-studio |
| `mandoc` | 27 | 27 | | | 13 s itself; its 26 dependents are the pages' installers |
| `zero-ad-deps` | | 11 | 2,117 s | 1,553 s | → spidermonkey → engine → zero-ad |
| `llvm-build` | | 3 | 2,578 s | 2,578 s | llvm-build → llvm-cc → llvm |
| `pi` | | 10 | 453 s | 278 s | pi → pi-runtime → pi-agent → pi-local → dollyfile-studio |
| a docs file (`dolly-docs`) | 4 | 4 | 253 s | 253 s | measured: 476 s wall (3.3) |
| a leaf package | 1 | 1 | its row: `sbase` 14 s, `make` 3 s, `git` 3 s, `wabt` 60 s, `sdl2` 169 s | | plus 2 s when nothing changed (README), 100–180 s of preparation in a round-shaped run |

Reading across: the sets from the root down to `cmake-build` differ by at most 1,500 s of sum and 620 s of chain, because the time is in the six images over 1,000 s, and all six sit below `cmake-build`. A `system-tools` change and a seed change cost within 4% of each other in build time. Below `cmake-build` the cost halves only at `rust-build` (5,781 s) and falls to minutes only for sets that avoid the Rust, LLVM and Mojo chains.

Limits of this arithmetic: durations are single builds at the loads of their dates (section 2's conditions column; 39 of the longest were measured alone on 10-11, the rest in three-lane stages); a round runs 1–3 at once, so its wall time lies between the chain and the sum, and section 3.2 shows the heavy images stretch 11–71% beside each other; the six images with no duration are counted as 0; `mojo-llvm`'s two measurements differ by 1,335 s and the smaller is used.

## 5. Tests in a round

| Suite | 10-13 round | night 10-14 (00:43) | night 10-14b (02:17) | night 10-14c (05:25) | v0.1.2 (10-11) | v0.1.1 (10-09) |
| --- | --- | --- | --- | --- | --- | --- |
| source (`node --test`) | 21 s, 430/0 | 25 pass line only | 429/0 | 430/0 | 424/0 | 421/0 |
| artifacts | 32 s, 24/1 | | | | 25/0 | 25/0 |
| core browser suite, Chromium + Firefox | 407 s (54 files × 2) | 407 s | 404 s, 1 fail (microphone) | 414 s | 951 s (47 × 2) | 916 s |
| demo suites | 36 min (16:28–17:04), 27 passed, 4 skipped | 39.5 min (01:00–01:40), 27/6 | 2 min, 4 tests | 5.5 min, 5 tests | 41 min | 34 min, failed |
| GPU checks | 23 min (17:04–17:27: local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics, slopyard by 17:23, mojo gpu) | 21 min (01:40–02:01; local-llm, slopyard, mojo, 0ad-graphics) | 15.5 min (local-llm only) | none | 18 min | 5 tests, exit 0 |
| later browser-suite reruns the same day | 403 s (`sdk-browser.log`), 405 s (`last-browser.log`) | | | | | |

The demo suites' longest members (10-13 `round.log`): xonotic 431 s, llvm-runtimes 325 s Chromium + 386 s Firefox, classicube 324 s, rts 264 s, python on default 181 + 193 s, bhop 168 s, wine 148 s, rust 85 s; the other 19 are under a minute each. The GPU checks have no per-test duration lines; their span is from the stage markers and the logs' mtimes.

Build time against test time: the 10-13 round spent 5 h 02 min in build stages (plus 51 min of preflight) and 66 min in tests; v0.1.2 spent 3 h 40 min building, 1 h 16 min testing, 37 min publishing; the night of 10-14 spent 10 min building (618 s) and 60 min testing (407 s + 39.5 min + 21 min); the second night run 8 min building and 23 min testing; the third 0 min building and 13 min testing.

## 6. What could not be found out

- Durations of `base64`, `codex-agent`, `llama`, `openal`, `speech-to-text-mic`, `vi`: built 10-13 14:01–14:59 in the light stage whose coordinator log was overwritten by the 16:00 rerun.
- Cold against cached: no log pairs the same image under both; the `packaged` row includes the browser's restore of the base image but not the coordinator's inspection (14–24 s per stage) or source preparation (75–176 s per stage, 134–143 s in the night runs), and no log separates download or cache-fill time inside an image's build.
- The job count of the 10-13 first (failed) heavy attempt and what failed in it: both failing `catalog-heavy.log`s were overwritten; the surviving one is the third attempt (1 job, zero-ad only).
- Which of the 116 "light" images of 13:59–14:48 were cached and which built: only the 56 image-log mtimes in that window say; the stage's `packaged` rows are gone.
- Per-image durations of the v0.1.0 round (`work/locks/build/checkpoint-evidence/`, outside this tree) and the serial-against-parallel identities after 10-01.
- The published release's packaging and upload: v0.1.2's two publish stages took 18 min each by the stage markers (`build/v012-evidence/round.log`), but nothing inside them is timed, and the GitHub upload (`build/deploy-v0.1.*.log`) was not read within this budget.
- Peak memory per image on any date after 10-01: the rounds' scripts carry the 14.5 GB, 20 GB and 9 GB figures as comments, not as measurements in the logs.
- Why the README's "17 min for the core tests in both browsers (2026-10-13)" differs from the round's 407 s.