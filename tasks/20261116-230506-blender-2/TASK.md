# Blender in Dolly, stage 2: Python complete and the blender package

- STATUS: OPEN
- PRIORITY: 140
- TAGS: blender,port,demo

Owner (2026-11-17): "would it be possible to compile and run blender in dolly?" Research and the
whole plan: `work/research/blender-2026-11-17.md`. Stage 1 (the headless build) is
[20261116-230501-blender-1](../20261116-230501-blender-1/TASK.md).

## State (2026-11-17)

Not started; waits for stage 1's program.

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
