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

- **NumPy inside Blender, the first thing to decide.** Blender is linked through cast emulation
  because its `METH_NOARGS` methods have one parameter and CPython calls them with two; such a
  program loads no extension module (`docs/process-model.md`). Either CPython calls a method by
  the type its flags say (a change to the `python` package's `cfunction_vectorcall_NOARGS` and
  the getters, which then needs no emulation if nothing else in Blender casts), or NumPy's
  modules are linked into Blender. Measure first which calls trap without emulation.
- The add-ons: which load, which need NumPy.
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
