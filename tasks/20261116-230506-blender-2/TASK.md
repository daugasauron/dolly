# Blender in Dolly, stage 2: Python complete and the blender package

- STATUS: OPEN
- PRIORITY: 140
- TAGS: blender,port,demo

Owner (2026-11-17): "would it be possible to compile and run blender in dolly?" Research and the
whole plan: `work/research/blender-2026-11-17.md`. Stage 1 (the headless build) is
[20261116-230501-blender-1](../20261116-230501-blender-1/TASK.md).

## State (2026-11-19)

The `blender` package (`demos/blender/Dollyfile-blender`) installs with `amy install blender`;
its test runs a script on the default scene (operators, a modifier, saving and loading a
`.blend`) and a Cycles render in both browsers. The licence rows and every linked library's
notices are in. Blender is linked through cast emulation because 236 of its 254 `METH_NOARGS`
methods take one parameter, which CPython calls with two (counted in the source; CPython cannot
know, and patching 236 functions would be a fork).

The compiler batch (0.1.8's compiler round) took the cc option filter out (the driver takes
Cycles' and the others' options as Clang does) and made `dso@0` load a library linked with
`--dolly-cast-emulation` into a program linked so (`docs/process-model.md`, `dso@0`).

NumPy works in Blender (branch `feature/blender-anim`, for the flyover's model,
[20261118-235900-blender-flyer](../20261118-235900-blender-flyer/TASK.md)):

- Blender is linked `-rdynamic` (in `PYTHON_LINKFLAGS`, where ELF's `-export-dynamic` was), a
  host of extension modules linked through the same cast emulation.
- Its recipe builds NumPy 2.5.4 with pip and Meson as `Dollyfile-python-data-build` does, with
  `LDFLAGS=--dolly-cast-emulation` (4 minutes), into `/usr/share/blender/5.3/scripts/modules`,
  which Blender's Python searches before `site-packages` (upstream's releases carry NumPy in
  their own Python's), so the `numpy` package beside it serves `python` alone.
- `import numpy` imports `ctypes`, whose import makes a libffi closure, which `dso@0` refused
  in a cast-emulated program: it now places the closure as a thunk of the program's signature
  (`b099128e6`, host code; `demos/tools/test/cast-emulation-browser.mjs` failed with status 7
  before, passes in Chromium and Firefox).
- `test/blender-browser.mjs` exports the default cube rising with the glTF add-on, imports it
  back and checks it risen at the last frame, and enables every bundled add-on: all 13 load.

The test passed in Chromium (30.9 s) and Firefox (39.7 s) on the branch's own build of the
package (2026-11-19: program 142 MB, data 90 MB with NumPy's 22 MB, snapshot 238 MB). Left: the
round that builds the catalog's package, the test on it, and what the package leaves out, by
measuring.

## What

`blender -b` as a package a session installs (`amy install blender`), with its Python working as
a script author expects.

- `bpy` on the default scene: operators (add, transform, modifiers), the dependency graph,
  saving and loading a `.blend`, `--python FILE`, `--python-expr`, `-- ARGS`.
- The standard library from the `python` package (CPython 3.14; Blender asks for 3.13 at least),
  `PYTHONHOME` or the prefix layout decided and stated.
- The bundled add-ons load; those that need NumPy (glTF) with a NumPy Blender can load.
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
