# godot-editor, numpy and spirv-wgsl differ by a few bytes each build of the same inputs

- STATUS: OPEN
- PRIORITY: 90
- TAGS: audit,build,reproducibility,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`). Evidence and scripts:
`work/audit-1116-evidence/buildtime/` (`changed-files.py`, `changed-files-016-017.txt`,
`record-diff.py`, `record-diff-016-017.txt`, `record-diff-python-data-build.txt`,
`scratch-codex-build.log`).

## State (2026-11-19): seven of eight build the same bytes again; zig-llvm's cache manifests left

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
- zig-llvm differs from the round's in its three cache manifests (`/home/dolly/.cache/zig/h/`), in
  every entry's time and in nothing else (2,203 entries): a manifest records the time of each
  source it hashed, and in a build a base image's files carry their restore's time, new each
  build, where a session's carry 1980-01-02, which the kernel gives every image file at boot
  (`kernel/system-snapshot.c:106`). Tried, and not kept: the lib's files given that time before
  the warmup leave one entry varying, the builtin module the first run writes
  (`b/…/builtin.zig`); given it after, and the tools run again, Zig keeps the times it has; with
  the manifests removed and the tools compiled again, one of the three is not made again, so a
  session would compile that tool. Left: a build's restored base with the image time, as at boot
  (the kernel, a seed change: after 0.1.8), or a step that writes the builtin module before the
  warmup (a recipe, possible by Friday).

What the round confirms: these images and their dependents (godot-voxel-flyover,
godot-lantern-drift, godot-airtime, blender-flyover, gnu-emacs) built in it, and their tests.

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
