# Lean 4 as an amy package, built inside Dolly from upstream's stage0

- STATUS: OPEN
- PRIORITY: 280
- TAGS: packages,demo,lean,0.1.4

Owner (2026-10-28): "I want to add lean to amy."

Lean 4 (`leanprover/lean4`, upstream's newest stable release) as a package: `amy install lean`
gives `lean` and `lake` with Lean's own library (`Init`, `Std`, `Lean`), built inside Dolly
from upstream's sources as OCaml is (`demos/ocaml`): upstream's `stage0` (the C of the previous
compiler) builds the first `lean`, which builds the release the way upstream's CMake does.
Nothing of the compiler is built on the host; a configure step outside Dolly is a bootstrap
exception the demo's README states.

## Done-when

- `amy install lean` works on `default`, from the full catalog and the domain's.
- `lean --run` of a file with `def main` prints its output; `lean FILE` accepts a theorem
  proved by `rfl`, `decide`, `simp` and `omega`, and rejects a false one with status 1.
- `lake new`, `lake build` and the built executable run, compiled to C and linked with `cc`
  (the package names what it needs from amy).
- A demo test passes in Chromium and Firefox; the package has its row in `test/amy-browser.mjs`;
  sources are pinned, with licence rows.
