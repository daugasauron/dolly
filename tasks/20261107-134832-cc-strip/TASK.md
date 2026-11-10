# cc refuses -s, which Godot and other release builds pass to strip

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,compiler,0.1.6

Godot's SConstruct links every release with `-s` (`SConstruct:884`); Dolly's cc answers
`unsupported option: -s`. Clang's driver passes `-s` to the linker, where wasm-ld takes it as
`--strip-all`: the name section goes with the debug information.

## State (2026-11-11)

Merged into main (`96c15c96f`): cc passes `--strip-all` for `-s` and `-ftemplate-depth=N` to
cc1, and `test/shell-browser.mjs` links a program with `-s`. Godot's platform no longer takes `-s`
out of its link flags and `Dollyfile-spirv-wgsl` no longer patches SPIRV-Tools for the depth. The
reconcile round of 2026-11-11 builds `llvm-cc` with the current seed, pins it as the seed's
compiler and rebuilds the runtime and the catalog with it; close when the shell test passes on
that seed and Godot and spirv-wgsl build without their workarounds.

Done when: the 0.1.6 compiler round has pinned an `llvm-cc` built with the change, the shell test
passes in Chromium and Firefox, and Godot and spirv-wgsl build without their workarounds.
