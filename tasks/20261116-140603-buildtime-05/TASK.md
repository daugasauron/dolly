# godot-editor, numpy and spirv-wgsl differ by a few bytes each build of the same inputs

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: audit,build,reproducibility,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`). Evidence and scripts:
`work/audit-1116-evidence/buildtime/` (`changed-files.py`, `changed-files-016-017.txt`,
`record-diff.py`, `record-diff-016-017.txt`, `record-diff-python-data-build.txt`,
`scratch-codex-build.log`).

## Closed (2026-11-20)

Round 018n passed on `282bc58c4` (`integrate/0.1.8`, `work/integrate-018`). Each of the five images
then built once more in that tree on the round's own dependencies, its record moved aside, in a
fresh browser profile (`repro-018n.sh`; it, its logs, the decoders and the logs and records of the
builds below are kept in `work/emacs-repro/build/repro-emacs/`):

- The round's bytes: voxel-flyover `2999254f…` (a first try failed on a `.cache` source link,
  fixed), lantern-drift `91efc447…`, airtime-godot `d4b980a2…`, zig-llvm `45010e50…`.
- emacs: round `17b695e3…`, rebuilt `7c42e764…`, in two files. `net/tramp-sh.elc` (249,506 against
  249,486 bytes): tramp-message.el's `defsubst` `tramp-error-with-buffer` inlined into
  `tramp-do-copy-or-rename-file-directly` from its source, where tramp.el's `defsubst`
  `tramp-get-default-directory` is inlined in turn, or from its bytecode, which calls it.
  `calendar/diary-icalendar.elc` (the same size): a UID, below.

The first is eieio-datadebug's race again: under `make -j4 compile-main` a file loads each library
it requires as bytecode if that is compiled by then, else as source (`load-prefer-newer`), and its
bytecode differs with it. Upstream compiles a few such files first (`MAIN_FIRST`, bug#25556) and the
recipe had added eieio-core; one more file each round does not hold. A second pass on the first
one's bytecode would not either: bytecomp writes each `.elc` by rename, but what the second pass
inlines from the first depended on timing.

Fixed by construction (`88d9377bd`), configuration only, in `Dollyfile-emacs`: `compile-main` runs 4
at once in batches of 16 (upstream's `XARGS_LIMIT='-n 16'`), each compile writing its bytecode as
`.elc-next` (`byte-compile-dest-file-function`, from `BYTE_COMPILE_EXTRA_FLAGS`) and a recipe for
`compile-targets` (given through `MAKEFILES`) moving the batch's into place when it ends, so a file
sees the bytecode of exactly the batches before it. `main-first` and `autoloads`, which compile-main
makes beside the first batch under `-j4`, run before it, one after the other. The eieio-core step
goes. Tried first, `compile-main` without `-j4` (one file at a time) has no race either, its builds
agreeing but for diary-icalendar (below), but emacs took 63 min (3,761 to 3,785 s, four builds at
once): the gnus and org files each load their package's main library as source, which is compiled
after them. Batched, emacs takes 29 to 31 min (1,738 s beside three serial builds; 1,826 to 2,004 s,
three batched builds at once), where the round's took 17 (1,040 s).

diary-icalendar's UID: `icalendar-make-component`, which `diary-icalendar` expands for its rrule
sexps, makes the component's UID while it expands, by `icalendar-uid-format`'s default `%h`, the
`sxhash` of its forms, and `sxhash` hashes a symbol by its address (`fns.c:5511`). Of seven builds
whose other files agreed (three serial, four batched), it differed in two (`271445661004744` against
`271446180090472` serial; `280420552608903` against `280420485441111` batched). What moves the
addresses between builds is not found: a probe image (not kept) compiling diary-icalendar against
its libraries' sources gave one UID six times in a build and the same in a build of other recipe
text, and a fresh symbol's hash was the same in builds with either catalog. The recipe sets
`icalendar-uid-format` to `%c`, a counter, for compile-main: the UID is `1`.

Built three times from a cold record, each in a fresh profile in a tree of its own
(`work/emacs-waves` registering gnu-emacs and default, `work/emacs-repro-2` and `-3` emacs alone;
removed since), all at once: `a8f08029…` each time, in 1,826 to 1,842 s. Against the batched build
before the counter only diary-icalendar.elc and the recipe differ. On it gnu-emacs built
(`e0fe9334…`) and `demos/emacs/test/emacs-browser.mjs` passes in Chrome and Firefox (a private
Xvfb). `npm run -s lint:dollyfiles` passes on the re-pinned recipes.

## State (2026-11-19): all eight build the same bytes again; the round confirms the three fixed today

What `ws/speed` fixed is in the 0.1.8 round (`work/integrate-018` at `8d666a4e4`): `cc` stages a
link under the output's own name (`StagedLink`, `programs/compiler.cpp`, in the seed compiler
`21685779…` whose fixed point the round's compiler stage found), `PYTHONHASHSEED=0` on
godot-editor's SCons, `SOURCE_DATE_EPOCH` on spirv-wgsl's make, contourpy built in a named
directory, and emacs's three lines before its dump.

`npm run image -- IMAGE --reproducible` builds the image's whole closure cold, twice (its server
hides every packaged snapshot): 39 images for numpy, 45 for godot-editor, hours each, which a
round has no time for. What the done-when asks of it is shown here another way, in
`work/rc-release` (`build/rehearse/repro.sh` and `twice.sh`, their logs): each image built again
on the round's own dependencies, its record moved aside so that it builds, in a fresh browser
profile, its digest beside the round's build of the same inputs; or, where its recipe changed
today, built twice.

- The same as the round's: numpy (`9e1e0faf…`), python-data-build (`5cad31a6…`: its 80
  extension modules' name sections and the wheels' `RECORD`s, which differed with 0.1.7's `cc`,
  no longer do), spirv-wgsl (`0c68e0b3…`) and godot-editor (`cbce9894…`, 18 min).
- voxel-flyover and lantern-drift differed from the round's in their `.pck`: each packed scene's
  `node_ids`, and the pack's digests of those scenes. Godot gives a node whose scene text names no
  `unique_id` a random one when it packs the scene for export (`ResourceUID::create_id`,
  `scene/resources/packed_scene.cpp:1100`); its editor writes one for each node it saves
  (`resource_format_text.cpp:2047`). Every node of the three games' scenes has one now (1, 41 and
  Airtime's 5, unique within each game). Built twice: voxel-flyover `1ae901fe…` both times,
  lantern-drift `cc820668…`, airtime-godot `25d065e9…`. On those, `godot-projects-browser.mjs`
  (the editor on Airtime's and Lantern Drift's projects, Ctrl+S saving a scene) and
  `godot-flyover-browser.mjs` pass in Chrome and Firefox on a display of the tree's own.
- emacs differed from the round's in one file, `eieio-datadebug.elc` (2,806 against 2,922 bytes:
  whether `eieio--class` accessors are inlined with a type check). `make -j4 compile-main`
  compiles it beside `eieio-core.el`, which it requires: it loads that library's bytecode or its
  source, whichever exists at that moment. Upstream compiles such files first (`MAIN_FIRST`,
  bug#25556), eieio-core not among them; the recipe compiles `emacs-lisp/eieio-core.elc` alone
  first. Built twice: `3b224b81…` both times (a race two builds show absent, not a proof). On it,
  gnu-emacs built and `demos/emacs/test/emacs-browser.mjs` passes in Chrome and Firefox.
- zig-llvm differed from the round's in its three cache manifests (`/home/dolly/.cache/zig/h/`),
  in every entry's time and in nothing else (2,203 entries): a manifest records the time of each
  source it hashed, and in a build a base image's files carry their restore's time, new each
  build, where a session's carry 1980-01-02, which the kernel gives every image file at boot
  (`kernel/system-snapshot.c:106`); the builtin modules carry their writing's. The recipe gives
  the lib's files that time before the setup, and the builtin modules after a first run writes
  them, then runs the setup again from them (`USE` posix, for `find`; 8 min where it took 4 to 7).
  Built twice: `a6bf183c…` both times, every manifest entry at the image time;
  `demos/zig/test/zig-llvm-browser.mjs` passes in Chrome and Firefox. The general cause, a build's
  restored base without the image time, is the kernel's: given it at restore, as at boot, the
  recipe's extra steps go (a seed change, after 0.1.8).

What the round confirms: these images and their dependents (godot-voxel-flyover,
godot-lantern-drift, godot-airtime, blender-flyover, gnu-emacs, ghostty-gtk) built in it, and
their tests. Then each of the five built once more in the round's tree on its dependencies
(`build/rehearse/repro.sh`'s way), the round's bytes again, closes this task; where the round's
inputs are this tree's, its digests are these: voxel-flyover `1ae901fe…`, lantern-drift
`cc820668…`, airtime-godot `25d065e9…`, emacs `3b224b81…`, zig-llvm `a6bf183c…`.

## Found

Found by comparing the published v0.1.6 and v0.1.7 (`work/locks/published/`), built at the same
image inputs (`sha256:87c27243…`) from recipes that differ, for these images, only in the version
text (`20261116-140453-buildtime-01`). The causes in the table are read from the differing bytes.
Built again from `b09b1e243` on 2026-11-17 (`scratch-series.log`): godot-editor came out other
bytes than 0.1.7's round (`87a6319f…` against `3e013cf0…`), so it differs build to build; codex,
rust-build, lean-meta, photocraft, llvm-build, zig-llvm-build, mojo-llvm, lean-std and lean came
out the round's byte for byte.

Outside `/etc/dolly/` (recipes, lock, receipt: the version text), 185 files, 487 MB, differ
between the two versions in images whose recipes did not change in substance (decoded from the
packs only one version has):

| File | Bytes differing | What differs |
| --- | --- | --- |
| the 80 extension modules (`*.cpython-314-dolly_0_wasm64.so`) of numpy, pandas, matplotlib, pillow, contourpy, kiwisolver and markupsafe in python-data-build, and the same in numpy, pandas, matplotlib, python-data | 12-16 each | the module name in the name section, `dolly-cc-0b2acbb16cb1d8e5-5.wasm` against `dolly-cc-63dc27f649b51461-5.wasm`: `cc` names its staged output by a hash of the output's absolute path (`programs/compiler.cpp:180-192`), and pip builds in a random `/tmp/pip-install-XXXXXXXX/` |
| contourpy's `util/_build_config.py`; the wheels' `RECORD` | 127; 41-801 | pip's random build directory, written by meson-python; the `.so` digests |
| `/usr/lib/libspirv-wgsl.a` (spirv-wgsl) | 5 | SPIRV-Tools' version string carries the build's time: `v2026.4 unknown hash, 2026-11-14T03:14:09+00:00` |
| `/usr/bin/godot-editor` (godot-editor and the Godot game images) | 39 of 175 MB | the string `-1284972823069948188` against `-9133842614070126978`, and an address in code that moved with it: Godot's `editor/editor_builders.py:62` writes `_doc_data_hash = "{hash(buffer)}"`, Python's `hash`, which Python seeds at random in each process |
| emacs's `.pdmp` (emacs, gnu-emacs) | 21 of 12.9 MB | not looked into |
| three manifests in zig-llvm's `/home/dolly/.cache/zig/h/` | not compared | not looked into |
| `lantern-drift.pck`, `voxel-flyover.pck` (the Godot games) | not compared | not looked into |
| `/usr/libexec/codex` (codex, codex-agent) | 47 of 200 MB | a local index in code. Not a per-build difference: codex built again from `b09b1e243` gave the snapshot of 0.1.7's round, `da78b6d8662f4267…`; what between the two commits reaches the binary is not found |

What it costs: each release publishes the packs that hold them as new packs (a returning visitor
downloads them again for unchanged programs); a rebuild of one of them with the same inputs
changes its dependents' inputs, so they build again ("dependency output changed"); and
`npm run image -- IMAGE --reproducible` cannot pass for them. Once a version bump stops changing
recipes (`buildtime-01`), these are the bytes that still differ between versions.

## Smallest fix

- `cc`: stage the output as `/tmp/dolly-cc-HASH/NAME`, the output's own file name in a directory
  named by the hash, so wasm-ld records the same name wherever the output is (a seed change).
- spirv-wgsl: `SOURCE_DATE_EPOCH` on its build, as `Dollyfile-gmqcc` and `Dollyfile-xonotic-build`
  already set (SPIRV-Tools' `utils/update_build_version.py:132-134` reads it).
- godot-editor: `PYTHONHASHSEED=0` on its SCons build (configuration, no patch).
- emacs, zig-llvm's cache, the two `.pck`: `npm run image -- IMAGE --reproducible`, to see whether
  they differ build to build or only between versions as codex does.

## Done when

`npm run image -- IMAGE --reproducible` passes for numpy, python-data-build, spirv-wgsl, emacs and
godot-editor.
