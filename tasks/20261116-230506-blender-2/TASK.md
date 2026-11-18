# Blender in Dolly, stage 2: Python complete and the blender package

- STATUS: OPEN
- PRIORITY: 140
- TAGS: blender,port,demo

Owner (2026-11-17): "would it be possible to compile and run blender in dolly?" Research and the
whole plan: `work/research/blender-2026-11-17.md`. Stage 1 (the headless build) is
[20261116-230501-blender-1](../20261116-230501-blender-1/TASK.md).

## State (2026-11-18, the compiler batch)

Two of the parts below are now the seed's, on `fix/compiler-batch`, for 0.1.8's compiler round:
- **The cc option filter is gone.** The driver (`programs/compiler.cpp`) takes the eight options
  `ccfilter.c` dropped as Clang does: `-Qunused-arguments` (nothing to silence),
  `-fstack-protector[-strong|-all]` (cc1's `-stack-protector N`; libc has the guard and its
  failure), Cycles' `-fno-trapping-math -fno-signed-zeros -freciprocal-math -ffp-contract=on` and
  `-ffast-math`, rendered for cc1 as Clang's driver renders them, and `-Wl,--version-script`,
  which it drops as Emscripten's emcc does (WebAssembly has no symbol versions). The filter, its
  staging and its launcher rows are out of `Dollyfile-blender-deps` and `Dollyfile-blender`.
  `test/cases/cpp.json` compiles and runs a program with all eight, and checks the macros Clang
  defines for them (`__FAST_MATH__`, `__FINITE_MATH_ONLY__ 1`, `__SSP_STRONG__`; the counts read
  from the pinned Emscripten container's Clang); it passes in Chromium and Firefox on the new
  seed. The round rebuilds both images and runs `demos/blender/test/blender-browser.mjs`.
- **`dso@0` loads a cast-emulated library into a cast-emulated program** (the contract is in
  `docs/process-model.md`, `dso@0`): `cc -shared --dolly-cast-emulation` passes the library
  through `wasm-opt --fpcast-emu` too; the loader admits into a cast-emulated host only a
  library whose table entries are thunks of the host's signature (refusing the others, and a
  cast-emulated library in any other program), and places each function it puts in the table
  (`GOT.func`, `dlsym`) as a thunk of that signature, or as the host's own thunk where it has
  one, so a pointer compares equal wherever it was taken. Closures stay refused.
  `demos/tools/test/cast-emulation-browser.mjs` checks calls both ways through pointers of other
  types, the equality and the refusal; it passes in Chromium and Firefox on the seed `llvm-cc`
  linked from this driver (`work/compiler`), and failed before (the library was not emulated).

What Blender needs then, not done here: it is linked without `-rdynamic` (its
`PYTHON_LINKFLAGS` replace ELF's `-export-dynamic`), so it hosts no library; with `-rdynamic`
it would, and NumPy's extension modules would have to be linked with `--dolly-cast-emulation`
too (a NumPy built for Blender, not the `numpy` package's).

## State (2026-11-17)

Stage 1 is done and went further than planned: the `blender` package exists
(`demos/blender/Dollyfile-blender`), `amy install blender` works, and its test runs a script on
the default scene (operators, a modifier, saving and loading a `.blend`) in both browsers. Left:

- **NumPy inside Blender: decided (2026-11-17), not in 0.1.8.** Blender is linked through cast
  emulation because 236 of its 254 `METH_NOARGS` methods take one parameter (counted in the
  source: mathutils 68, gpu 57, bmesh 42, bpy 31, Freestyle 27, generic 12) and CPython calls
  each with two; such a program loads no extension module (`docs/process-model.md`).
  - CPython cannot help: the method's flags do not say how many parameters its function has.
  - Patching Blender (a second parameter on 236 functions, then whatever else casts) is a fork
    to carry at every release, against the porting rules.
  - Linking NumPy's extension modules into Blender would make its build part of this one, for
    one library, and the next add-on's module would be stuck the same way.
  - **So the mechanism is the answer**: `dso@0` loads a library that went through the same cast
    emulation into a program that did (today it refuses, since a library's table entries have
    other signatures; an emulated library's are the same thunks). That gives Blender NumPy and
    any other extension module, and GObject programs their plugins. It is a core change with a
    contract, for the release after 0.1.8; until then `import numpy` in Blender fails with the
    loader's message, which the README states.
- **The cc option filter stays** (`demos/blender/ccfilter.c`): the driver accepting what Clang
  accepts is `programs/compiler.cpp`, a seed change, so it belongs to a compiler round; the
  filter goes then (the integrator, 2026-11-17).
- The add-ons: which load, which need NumPy. Not measured yet in Dolly. Blender's own Linux
  build loads 12 of its 13 bundled add-ons in background mode (`addon_utils.enable` on each;
  Rigify fails there too); the same script (`build/blender-dev/share/addons.py`, eleven lines
  to write again) is the check to run on the package.
- Done on 2026-11-17: the licence rows (`docs/licences.md`, `demos/blender/upstreams.json`),
  every linked library's notices in `/usr/share/licenses/blender`, and the branch on
  integrate/0.1.8's layout (DOLLY 8, `demos/blender/source-pins.sh`).
- The licence rows in `docs/licences.md`, the libraries' notices in `/usr/share/licenses`, and
  the source archive beside the image.
- What the package leaves out, by measuring (it is 177 MB).
- A round with the rest of the catalog: this branch's tree has the 0.1.7 release's images.

## What

`blender -b` as a package a session installs (`amy install blender`), with its Python working as
a script author expects.

- `bpy` on the default scene: operators (add, transform, modifiers), the dependency graph,
  saving and loading a `.blend`, `--python FILE`, `--python-expr`, `-- ARGS`.
- The standard library from the `python` package (CPython 3.14; Blender asks for 3.13 at least),
  `PYTHONHOME` or the prefix layout decided and stated.
- The bundled add-ons that need no NumPy load; those that do (glTF) with the `numpy` package.
- The package's size and what it leaves out (translations, the big fonts) decided by measuring.
- The source archive served beside the image and the licence rows (`docs/licences.md`,
  `config/upstreams.json`): Blender is GPL, and its libraries' notices go into
  `/usr/share/licenses`.
- `demos/blender/test/blender-browser.mjs`: installs the package into `default` and runs a script
  that builds a mesh, applies a modifier, saves, loads and compares, in Chromium and Firefox.

## Size and risks

1 to 2 days after stage 1. Risks: an API CPython 3.14 removed that Blender 5.3 uses; the
package's size against an image's 2 GiB and a session's 8 GiB; add-ons that reach the network
(the extensions repository) must fail explicitly.

## Done when

The browser test passes in both browsers from the catalog's package, and the README says what
works and what is left out.
