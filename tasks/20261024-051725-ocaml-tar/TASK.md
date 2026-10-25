# OCaml's source archive differs from tree to tree

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: demo,bug,0.1.4


## Closed (2026-10-25): the archive is the same from any tree

Cause: libtool's configure measured the host's command-line limit, which follows the stack limit
of what runs the preparation (`3145728` in one tree, `1572864` in another); `3b0cc25f` gives it
instead. Prepared under 8 MB and 16 MB stacks the trees are identical, and the full round of 2026-10-25 on `main` `500d4329` (seed `debea04d`, evidence `work/x11fix/build/round-1025-evidence`) staged
`beac0764`, the archive `work/runtime` staged from its own path before.

## State (2026-10-24)

`dist/static/ocaml/ocaml.tar.gz`, which `demos/ocaml/Dollyfile-ocaml` pins, is not the same in
every worktree: `work/runtime` stages `beac0764…` (the pin `5cc16fd1` restored there), and the
catalog build in `work/x11fix` staged `e8285548…` from the same commit's sources and rewrote
the recipe's pin to it (committed with the merge `e4af2690`). So which pin is right depends on
the tree that prepares it, as the Wine archive's did until `b0c81efd`/`222a31eb` (an absolute
path written into a generated file, Perl's hash order, a gzip header's time).

To do: prepare the archive in two directories, compare the trees file by file to find what
differs, and make the preparation write the same bytes everywhere (`gzip -n`, a fixed order,
no absolute paths). Done when the sha256 is the same from two different worktree paths and
the recipe's pin no longer changes when another tree builds it.
