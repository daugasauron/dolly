# Blender in Dolly, stage 2: Python complete and the blender package

- STATUS: OPEN
- PRIORITY: 140
- TAGS: blender,port,demo

Owner (2026-11-17): "would it be possible to compile and run blender in dolly?" Research and the
whole plan: `work/research/blender-2026-11-17.md`. Stage 1 (the headless build) is
[20261116-230501-blender-1](../20261116-230501-blender-1/TASK.md).

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
