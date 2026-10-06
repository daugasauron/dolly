# A payload larger than the image cap is several ordinary packages, split where its consumer already reads

- STATUS: OPEN
- PRIORITY: 280
- TAGS: packages,dollyfile,models

From `20261005-131646-webgpu-any-gpu` (section on the 4B model): a package
is an image, an image is capped at 2 GiB, and Qwen3.5-4B Q4_K_M is
3,013,027,808 bytes, so today it downloads on first use into `/run` instead of
installing with `amy`. The owner delegated the choice of mechanism ("research
them thoroughly and go with the answer that aligns with the goal of the
project").

## Decision (2026-10-06)

No new mechanism. A package stays an image and an image stays capped at
2 GiB. A payload larger than that is published as several ordinary packages,
split along a boundary its consumer already reads, and installed with
`amy install A B C`. For GGUF that boundary is llama.cpp's own shard format
(`NAME-0000i-of-0000N.gguf`): the 4B becomes shard packages of at most 1 GiB,
each one `SOURCE` line with one pin, and llama loads the set from the first
shard. A single file larger than the cap remains unsupported and fails at
sealing, as today, until a payload without a format of its own needs it.

Rests on `AGENTS.md`:

- "Every line of code is a maintenance burden", "Never keep/add code that
  'might be useful in the future'", "Simple is better than easy": the two
  options on the table each added a core concept (an ordered package set in
  `amy` and the index, or a lazily fetched record in the kernel) for one
  payload whose consumer needs neither.
- "Mutable userspace state lives in WebAssembly memory" and "A browser cache
  may hold immutable distribution bytes; it must not become the mutable guest
  filesystem": a lazily fetched source makes a file's content arrive from the
  network at first read, so a `read` can fail with a transport error and the
  image is no longer the complete, verified state it restores. Rejected.
- "The core interface must remain small, typed, inspectable, and versioned":
  the snapshot format, the index rows (`NAME URL SHA256`) and `amy` are
  unchanged.
- "Prefer unchanged upstream source plus target/toolchain configuration":
  the split is upstream's `gguf-split` from the pinned llama.cpp, and the
  loader is upstream's.

## Evidence (`core/decisions`, 2026-10-06)

- One image is one byte stream in which every file is whole and inline in one
  record (`src/fs-record.h:15-32`, `src/snapshot-records.mjs:3`:
  `MAX_SNAPSHOT_BYTES` 2 GiB bounds an image, a pack and a record;
  `src/system-snapshot.c:518` refuses a larger capture). No reason for the
  number is written down; the evident one is that the page and the kernel
  each hold an image as one buffer (`src/image-artifact.mjs:151-175`). Raising
  it was not measured and is not needed for this decision.
- `MAX_SOURCE_BYTES` is 1 GiB per `SOURCE` (`src/dollyfile.c:25`), which is
  why `qwen3.5-2b` is two parts joined with `cat` at build
  (`demos/local-llm/Dollyfile-qwen3.5-2b`,
  `demos/local-llm/prepare-local-llm-weights.mjs`). Hosting splits any static
  file into 20 MiB parts under Cloudflare's 25 MiB limit and streams them
  back verified (`src/static-asset.mjs:6-7`); that is transport and already
  works for 1 GiB sources.
- A live file may exceed 2 GiB (8.3 GB measured,
  `tasks/20261002-010000-fs-file-growth-abort`); only an image, a session
  delta (512 MiB) and a `SOURCE` are bounded.
- `amy install` takes several names (`src/commands/amy.c:205-207`) and
  fetches, verifies and installs one package at a time, so the kernel holds
  one package twice at most (artifact and installed files) before the
  artifact is deleted.
- The pinned llama.cpp (`093a2f86`) loads a split model from its first shard:
  `src/llama-model-loader.cpp:595-647` reads `split.count`, derives the other
  paths with `llama_split_path` and opens each. Its source archive carries
  `tools/gguf-split/`. Dolly's runner reads tensors without `mmap`
  (`demos/local-llm/main.cpp:32`), so shards are read as files are today.
- Catalog today: `qwen3.5-800m` 580 MB, `qwen3.5-2b` 1.40 GB, `minicpm5-2b`
  1.56 GB (73% of the cap). The 4B is 1.40 times the cap.

Rejected:

- Byte-range part packages with a join (the WebGPU agent's option 1): `amy`
  and the index learn ordered sets, and the joined file exists beside its
  parts, 6 GB in an 8 GiB kernel, unless a streaming join is written too.
- Lazy sources (option 2): above.
- Raising the cap: touches the snapshot format bounds in C and JavaScript, the
  packages service, the session and cache limits, and every browser's largest
  buffer, for one model.

## Plan

All in `demos/local-llm/`; no core file changes.

1. `prepare-local-llm-weights.mjs`: for a model with `"shards": N` in
   `models.json`, build `llama-gguf-split` natively from the pinned archive
   (`.cache/llamacpp-*.tar.gz`, `tools/gguf-split`) and run
   `--split --split-max-size 1G` on the verified upstream GGUF; stage each
   shard as `llm/ID/ID-0000i-of-0000N.gguf` and check the count is N.
2. One recipe per shard, `Dollyfile-qwen3.5-4b-I`: `PACKAGE qwen3.5-4b-I`,
   one `SOURCE` to `/usr/share/dolly/llm/qwen3.5-4b-0000I-of-0000N.gguf`, the
   license in the first, `EXPORTS FILE`.
3. `models.json`: the 4B row names its shard images; `model.mjs` returns the
   first shard's path when all are installed and otherwise prints the
   `amy install` line. The first-use download of a 3 GB file and its
   `/run/dolly-llm` path go away (no second way to get the same model).
4. `pi-local` is rebuilt in a catalog round, since `model.mjs` is in it.

## Done when

- `amy install qwen3.5-4b-1 ... qwen3.5-4b-N` in a local-LLM image, then a
  completion from the 4B on WebGPU, in Chrome and Firefox, with no request to
  huggingface.co (the test's request log).
- Every shard image is under 1.1 GiB, and during the install the kernel
  holds the installed shards plus one shard's artifact at most (measured).
- No file under `src/`, `host/`, `abi/` or `include/` changed.

## Not measured yet (the first steps)

- That `gguf-split` output is byte-identical across runs (the pins need it)
  and that no tensor of the 4B exceeds 1 GiB (the largest shard must fit one
  `SOURCE`).
- The load in Dolly from shards; only the loader's source was read.
- Not implemented on 2026-10-06: it needs a `pi-local` rebuild (excluded
  from that round), a display for a GPU run (none was assigned), the 3 GB
  download, a native tool build and N image builds.
