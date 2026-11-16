# godot-editor, numpy and spirv-wgsl differ by a few bytes each build of the same inputs

- STATUS: OPEN
- PRIORITY: 90
- TAGS: audit,build,reproducibility,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`). Evidence and scripts:
`work/audit-1116-evidence/buildtime/` (`changed-files.py`, `changed-files-016-017.txt`,
`record-diff.py`, `record-diff-016-017.txt`, `record-diff-python-data-build.txt`,
`scratch-codex-build.log`).

## State (2026-11-17)

Found by comparing the published v0.1.6 and v0.1.7 (`work/locks/published/`), built at the same
image inputs (`sha256:87c27243…`) from recipes that differ, for these images, only in the version
text (`20261116-140453-buildtime-01`). The causes in the table are read from the differing bytes.
Built again from `b09b1e243` on 2026-11-17 (`scratch-series.log`): godot-editor came out other
bytes than 0.1.7's round (`87a6319f…` against `3e013cf0…`), so it differs build to build; codex,
rust-build, lean-meta, photocraft, llvm-build, zig-llvm-build, mojo-llvm, lean-std and lean came
out the round's byte for byte.

## Found

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
