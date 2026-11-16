# Where 0.1.7's 13 h 31 min went, and what cuts a release most

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: audit,build,release,0.1.8

The build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`), from the owner: "Especially build time. Releasing takes so long time... I guess most
is image rebuilds." Evidence and the scripts that produced it:
`work/audit-1116-evidence/buildtime/`. Each lever is its own task; this one is the map.

## State (2026-11-17)

Closed: see the closing section.


## Where the time went

0.1.7, from the round's start to the release's last check (`work/round1113/build/round-1117.log`,
`build/release-0.1.7.log`, `work/round-1117.sh`, `work/release-0.1.7*.sh`):

| Step | Clock | Time |
| --- | --- | --- |
| runtime, Rust and Go seeds, pins | 01:40-01:43 | 3 min |
| **images: all 230 built, 2 at a time** | 01:43-07:33 | **5 h 50 min** |
| lint, source and artifacts suites | 07:33-07:34 | 1 min |
| browser suite (4 side by side) | 07:34-07:52 | 18 min |
| npm test again | 07:52-08:00 | 8 min |
| demos suite | 08:00-08:51 | 51 min |
| GPU tests, one at a time | 08:51-09:39 | 48 min |
| compiler URL commit, merge, packaging | 09:40-10:18 | 38 min |
| `npm run image` again (the registry the packaging narrowed), checklist | 10:18-10:40 | 22 min |
| tag, npm offline test (the disk filled; resumed), push, GitHub release | 10:40-10:55 | 15 min |
| core deployment, live boots | 10:55-11:06 | 11 min |
| **live check, file by file** | 11:06-12:06 | **60 min** |
| the showcase recorded on the published site | until 13:26 | 1 h 20 min |
| packaging again (the disk filled; resumed), export, compare | 13:26-14:13 | 47 min |
| deployment, live boots, archive, push | 14:13-14:22 | 9 min |
| **live check, file by file, again** | 14:22-15:11 | **49 min** |

Images are 43% of it; tests and GPU tests 16%; two packagings 11%; two live checks 13%. The
longest images (`packaged-1117.txt`): llvm22 4,552 s, llvm-build 3,103, codex 2,428, mojo-llvm
2,313, rust-build 2,196, photocraft 2,141, lean-meta 1,953, zig-llvm-build 1,734, rust-llvm 1,589,
lean-std 1,208, godot-editor 1,168; the graph's longest chain, system-build to codex-agent through
cmake, python, rust-llvm, rust-build and codex, is 2.13 h (`critical-path-1117.txt`).

Across the 0.1.6 and 0.1.7 rounds (13-15 November, `rebuild-reasons-1113-1117.txt`): 999 image
builds, 50.7 h of build time (about 25 h at 2 at a time) for a catalog of 230: 37.9 h because the
image inputs (the seed and the process-side contracts) took four values between 08:41 on the 13th
and 11:26 on the 14th (`2ee43eaf`, `79275cdf`, `b030fb4d`, `87c27243`, the rounds' `runtime-2.log`),
12.7 h for recipe changes, 11.4 h of that the version bump.

## What cuts it most, measured

1. `20261116-140453-buildtime-01`: a version bump rebuilds every image. 0.1.7's 5 h 49 min of
   images would have been 230 s with version-free recipes (35 s without the two sources that embed
   the version); 96% of its snapshot bytes were already in 0.1.6's packs.
2. `20261116-140603-buildtime-02`: 2 builds at a time keep 5.7 of 16 threads busy. Replayed, the
   catalog takes 3.9 h at 3 and 3.05 h at 4 (lower bounds; the graph's longest chain is 2.13 h).
   Ten of the heaviest images built alone peak at 3.9-13.2 GiB PSS (codex the most, noted at 20 GB
   before); the heaviest four of them that can run at once sum to 34.9 GiB, inside the rounds'
   36 GiB cap. The rest of the catalog's peaks and one catalog at 4 come next.
3. Seed changes in one round: four image-input values in 27 hours cost 37.9 h of build time; one
   round costs 11.4 h (the owner's direction since 2026-11-07, batch before a rebuild).
4. `20261116-140603-buildtime-03`: a packaging takes 31-38 min, 24.5 of them accepting 59 images
   one after another (12.2 four side by side, measured); it also verifies the sealed site three
   times and gzips every pack again: about 25 min to win per packaging, of which 0.1.6 had four
   and 0.1.7 two.
5. `20261116-140603-buildtime-04`: the npm test runs four times a release, Xonotic's twice a round:
   about 16 and 8.6 minutes.
6. The live check is bound by the link: four 20 MiB parts took 9.1 s one after another and 9.3 s
   side by side (`fetch-rate.txt`), about 9 MB/s, so 24 GB takes 45-60 min however it is fetched.
   The second check fetched all of v0.1.7 again for 89 new files under `agents/`, after the
   export's comparison had shown every other file the same bytes (`part2-compare.log`). The second
   deployment (packaging, export, deployment and that check: 1 h 45 min, and the 1 h 20 min of
   recording before it) is `tasks/20261116-140230-repo-06`.

Measured and not worth changing:

- LLVM 22.1.8 is compiled twice, for Zig and for Rust (`20261116-140603-buildtime-06`): one build
  for both saves 0.23 h at 2 builds at a time and makes the longest chain 3.01 h instead of 2.13 h.
- rust-build compiles rustc twice and the standard library twice, by design
  (`demos/rust/README.md`: nothing of the seed is in the `rust` package): of its 2,196 s on the
  longest chain, the second rustc takes 613 s, its driver 175 s and the second standard library,
  compared byte for byte with the first, 60 s (`build/image-logs/rust-build.log`).
- `system-tools`, the base of 38 recipes, installs `display`, so zig-build and ghostty-build
  (616 s) are on the longest chain and a change of the terminal's package rebuilds the 186 images
  that depend on it. Without it the replayed catalog is 0.05 h shorter at 4 builds at a time and
  0.13 h at 6 (`schedule-system-tools-without-display.txt`).
- The checklist's token and private-key scans over 42 GB of snapshots: 28 s and 17 s
  (`checklist-scans.txt`). They include 23 retired images' snapshots (5.05 GB) still in
  `work/round1113/dist/` (airtime, bhop, codex-build, …), which no release ships.
- The export's brotli of the six static files over Pages' 25 MiB (`dolly.data`, zig.tar, …):
  24 s for 321 MB (`brotli-rate.txt`).
- Per-image overhead: the 135 images under 30 s take 2,014 s together; the 17 of 600 s or more take
  28,900 s, 71% of the catalog (`packaged-1117.txt`).
- `npm run image -- --plan` takes 0.6 s; a run that builds nothing 72-169 s, mostly source
  preparation.

Found on the way: `20261116-142713-buildtime-07` (acceptance passes 8 images it checks nothing
of) and `20261116-140603-buildtime-05` (builds that differ by a few bytes each time).

Related open tasks: `tasks/20261116-140822-ports-04` (each demo's share of a full rebuild: eight
chains are 69%), `tasks/20261116-140017-repo-01` (the round lives in `work/`),
`tasks/20261115-115901-release-disk` (the copies that filled the disk twice),
`tasks/20261115-115901-godot-display` (two Godot tests run in both suites),
`tasks/20261104-131850-llvm-relocation-calls` (every compile's object writer: 1.7 s of a 4.5 s
`cc -O2 -c`).

## Done when

The levers above are closed or decided, and a release's log shows the time of each step against
this table.

## Closed (2026-11-17)

Each lever is done or owned by its task:

1. A version bump rebuilds every image: `tasks/20261116-140453-buildtime-01`, `ws/versionless`
   (DOLLY 8, `95ba9c87e`: no version in a recipe's paths).
2. Builds at a time by measured memory: `tasks/20261116-140603-buildtime-02`, `ws/speed`.
3. Seed changes in one round: the owner's direction (batch before a rebuild); `scripts/round.sh`
   is one round, its `compiler` stage the fixed point.
4. Packaging: `tasks/20261116-140603-buildtime-03`, `ws/speed`.
5. The npm test four times and Xonotic's twice: fixed on `ws/release`,
   `tasks/20261116-140603-buildtime-04` (its State says what the round confirms).
6. The second live check: the showcase's deployment fetches only the files the archived one
   lacks (`published-version.mjs verify SITE OUT vX.Y.Z ARCHIVE`, `tasks/20261116-140230-repo-06`);
   the first check stays bound by the link, measured.

The rest was measured and decided not worth changing (the list above), and the two found on the
way are `tasks/20261116-142713-buildtime-07` (closed) and `tasks/20261116-140603-buildtime-05`
(`ws/speed`). A release's logs show each step's time against this table: `scripts/round.sh`
prints each stage's minutes, `scripts/release-checklist.sh` the minutes at each step.
