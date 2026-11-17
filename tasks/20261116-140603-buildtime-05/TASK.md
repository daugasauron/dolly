# godot-editor, numpy and spirv-wgsl differ by a few bytes each build of the same inputs

- STATUS: OPEN
- PRIORITY: 90
- TAGS: audit,build,reproducibility,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`). Evidence and scripts:
`work/audit-1116-evidence/buildtime/` (`changed-files.py`, `changed-files-016-017.txt`,
`record-diff.py`, `record-diff-016-017.txt`, `record-diff-python-data-build.txt`,
`scratch-codex-build.log`).

## State (2026-11-17, ws/speed)

Fixed on `ws/speed`, as the smallest fix below says; the 0.1.8 round confirms what needs the new
compiler or a heavy chain.

- `cc` stages a link under the output's own name, alone in a directory named by the hash
  (`StagedLink`, `programs/compiler.cpp`), so wasm-ld names the module the same wherever the
  output goes. Compiled natively against `DOLLY_LLVM_COMMIT`'s LLVMSupport
  (`work/audit-1116-evidence/buildtime/fix-speed/stagedlink-check.cpp`): the link is staged as
  `DIR/_multiarray_umath.cpython-314-dolly_0_wasm64.so` and the directory is gone after it. A
  seed change: the round builds `llvm-cc` with it and pins it, and every image rebuilds; the
  extension modules' name sections then read their own file names.
- spirv-wgsl: `SOURCE_DATE_EPOCH=1793750790`, its pinned SPIRV-Tools commit's time (the archive's
  entries, 2026-11-04T00:06:30Z), on the make that runs `update_build_version.py`
  (`demos/godot/Dollyfile-spirv-wgsl`). Rebuilds spirv-wgsl and the Godot images. Built twice
  in `work/speed` (`fix-speed/rebuild-twice.sh`, `rebuild-spirv-wgsl-*.log`): the same snapshot
  both times, `c2006e47…`, whose library reads `v2026.4 unknown hash, 2026-11-04T00:06:30+00:00`.
- godot-editor: `PYTHONHASHSEED=0` on its SCons build (`demos/godot/Dollyfile-godot-editor`);
  `hash(b"godot docs")` in two `python3` processes: two values without it, one with it.
  Rebuilds godot-editor and the Godot game images.
- contourpy wrote pip's random source and build directories into `contourpy.util.build_config()`
  (`_build_config.py`, 127 bytes): python-data-build unpacks its source and builds it from there
  in a build directory it names (`--config-settings=build-dir=`, meson-python's); the
  `install` helper takes an unpacked source where a row made one. Built in `work/speed`, its
  `build_dir` is `/tmp/python-data/contourpy-1.4.0/build/lib/contourpy/util` and `source_dir`
  `/tmp/python-data/contourpy-1.4.0/lib/contourpy/util`. Rebuilds python-data-build, numpy,
  pandas, matplotlib, seaborn, python-dateutil and python-data. Built twice there with 0.1.7's
  compiler (`fix-speed/compare-python-data-build.txt`): the 85 files that differ are the
  extension modules (their name sections, which the new `cc` fixes) and the wheels' `RECORD`s
  (those modules' digests); `_build_config.py` no longer differs.
- emacs differed build to build: built twice in `work/speed` with unchanged inputs it gave three
  digests with 0.1.7's, 18 bytes of the `.pdmp` in three places (`fix-speed/compare-emacs-*.txt`,
  read with `extract-file.py`): `emacs-build-time`, the float `gc-elapsed` (0.39 s of collections)
  and a `(TICKS . 1000000000)` cons beside `*scratch*`'s markers, `buffer-display-time`. Emacs is
  configured `--disable-build-details`, upstream's switch for the first (`prepare-emacs.sh`);
  the other two are dump-time state that upstream's loadup keeps, so `emacs-dolly.patch` adds
  three lines before the dump: `gc-elapsed` nil (it is not counted while nil, and `init_alloc`
  resets it at startup) and every buffer's `buffer-display-time` nil. Each step built twice
  (`rebuild-emacs-*.log`): 18, 11, 4, then 0 bytes; the last two builds `f1cc9240…` both.
  `demos/emacs/test/emacs-browser.mjs` passes in Chromium and Firefox. Rebuilds emacs and
  gnu-emacs.

The round must confirm, after its catalog: `npm run image -- IMAGE --reproducible` for numpy,
python-data-build, spirv-wgsl, emacs and godot-editor (the done-when), and
`work/audit-1116-evidence/buildtime/fix-speed/rebuild-twice.sh` (the image alone, twice) for
zig-llvm, voxel-flyover and lantern-drift, whose cache manifests and `.pck` files no one has
built twice yet (`compare-builds.sh IMAGE` names what differs).

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
