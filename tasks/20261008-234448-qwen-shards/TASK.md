# One package for the Qwen 4B model, or none

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: local-llm,amy,packages

Owner (2026-10-08): "I really don't like the sharded qwen stuff.. does it
have to look like that? if so I prefer to remove it. shouldn't have to
install 4 different amy packages one by one like this."

## As it is (read from the recipes, v0.1.0)

- `demos/local-llm/Dollyfile-qwen3.5-4b-1` … `-4` are four packages, one
  `gguf-split` shard each ("The model needs all four"); a user runs
  `amy install` four times.
- `qwen3.5-2b` is one package: its recipe joins two `.part` sources into the
  upstream GGUF and checks its SHA-256.

## To find out first

- Why the 4B model is not built the way the 2B one is: which limit the
  joined file meets (a package's size, one file's size in the kernel's
  memory, a browser allocation, the publication's part size) and whether that
  limit is real or only how the recipe was written.
- Whether one package `qwen3.5-4b` can `INSTALL` the four shards (as `cargo`
  installs `rust`), so that one `amy install qwen3.5-4b` brings the model and
  the shard packages stop being something a user names.

## Done when

- `amy install qwen3.5-4b` alone gives a model that `pi-local` loads, shown
  in a browser test, and the catalog lists one entry for it; or
- if that cannot be done without the four visible packages, the 4B model and
  its packages are removed, with the measured reason recorded here.

## Found, and closed into `packages` (2026-10-12)

- The limit is the 2 GiB an image holds (`MAX_SNAPSHOT_BYTES`,
  `src/snapshot-records.mjs`: one buffer per snapshot). Qwen3.5-4B is
  3.01 GB; the 2B model is 1.40 GB and fits, which is why its recipe joins
  two parts into one file and the 4B one cannot.
- A `qwen3.5-4b` package cannot `INSTALL` the four shards: a package holds
  what it installs (measured: `cargo` is 499.8 MB of which `rust` is 463.1,
  of which `cc` is 126.3), so it would be one 3.01 GB snapshot.
- One name needs packages that name their dependencies instead of holding
  them: item 3 under "Held for a catalog round" in
  [`20261012-130814-packages`](../20261012-130814-packages/TASK.md), an
  engine change and a round. Until then the four stay, since Pi's `/local`
  installs all four by itself; removing the model is a `pi-local` rebuild
  that the tree this was read in could not make. Neither line of the
  done-when above is met: the decision is with that item.
