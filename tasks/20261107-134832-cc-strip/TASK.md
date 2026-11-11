# cc refuses -s, which Godot and other release builds pass to strip

- STATUS: CLOSED
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

2026-11-11, 14:10: the phase 1 seed (`da9a4af8…`) refused it. `c++ -ftemplate-depth=1024` in
`system` failed with `error: unknown argument: '-ftemplate-depth'`: cc gave cc1 the depth as
a separate argument, as for `-ferror-limit`, but the pinned LLVM defines only the joined
`ftemplate_depth_EQ` for cc1 (`clang/include/clang/Options/Options.td`), and `c++ -Xclang
-ftemplate-depth=1024` compiles. Fixed on `fix/cc-template-depth` (cc passes the argument as
it is), which takes another compiler round (`work/round-1111d.sh`). Also measured: a 1,500-deep
template instantiation exhausts the compiler's stack in Chrome (status 126) before the depth
error; the default depth is 1024 and SPIRV-Tools does not need more.

Done when: the 0.1.6 compiler round has pinned an `llvm-cc` built with the change, the shell test
passes in Chromium and Firefox, and Godot and spirv-wgsl build without their workarounds.

## Closed (2026-11-11)

Done: `96c15c96f` and `26288e504` (cc passes `-ftemplate-depth=N` as it is, merged in
`a6c0cd24a`). On the 0.1.6 compiler round (`work/round-1111d.sh` to `round-1111i.sh`; seed and catalog pinned in `d1cb11dbc` and `6fdcad104`, image inputs `16a63999…`; logs in `build/round-1111-evidence/rerun*`), whose `llvm-cc` was built with the change and pinned as the seed's
compiler (`d1cb11dbc`): `test/shell-browser.mjs` (which links with `-s`) passed in Chromium and
Firefox, `godot` and `spirv-wgsl` built without their workarounds, and the Godot and PhotoCraft
GPU tests passed.
