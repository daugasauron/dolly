# One package for the Qwen 4B model, or none

- STATUS: OPEN
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
