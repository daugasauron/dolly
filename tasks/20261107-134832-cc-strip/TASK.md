# cc refuses -s, which Godot and other release builds pass to strip

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,compiler,0.1.6

Godot's SConstruct links every release with `-s` (`SConstruct:884`); Dolly's cc answers
`unsupported option: -s`. Clang's driver passes `-s` to the linker, where wasm-ld takes it as
`--strip-all`: the name section goes with the debug information.

## State (2026-11-07)

`aeb630ee8` on `fix/cc-strip` (from `integrate/0.1.6`): cc passes `--strip-all` for `-s`, and
`test/shell-browser.mjs` links a program with `-s`, checks it is smaller and runs it. The seed's
compiler is the one the previous seed built, so the change takes effect only after a compiler round
(`docs/sources.md`); the shell test's case fails until then, so the branch joins the 0.1.6 round
with that round.

Until then Godot's platform (`demos/godot/platform/SCsub`) takes `-s` out of its link flags; it
drops that once the seed's cc takes it.

The same holds for `-ftemplate-depth=N` (2026-11-08), which SPIRV-Tools' CMake passes to every
Clang: cc refused it. `src/compiler.cpp` now passes it to cc1, and `test/cpp-browser.mjs` builds
with it; until the round, `demos/godot/Dollyfile-spirv-wgsl` takes the flag out of SPIRV-Tools'
`CMakeLists.txt` (`spirv-tools-depth.patch`), and drops that patch once the seed's cc takes it.

Done when: the 0.1.6 compiler round has pinned an `llvm-cc` built with the change, the shell test
passes in Chromium and Firefox, and Godot's platform no longer filters `-s`.
