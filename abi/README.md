# Machine contracts

The WAT files here are the canonical source of Dolly's exact Wasm boundaries.
C headers, such as [`process.h`](../include/dolly/process.h) and each host
module's `host/NAME/NAME.h`, define packet layouts above them; generated JSON is
linker input only. The comments in each
WAT file document its semantics.

| Contract | Boundary |
| --- | --- |
| [`dolly-process-0.wat`](dolly-process-0.wat) | Ordinary executables: private shared memory64, one import `dolly_process_0.call`, export `_start` |
| [`dolly-process-gate-0.wat`](dolly-process-gate-0.wat) | Policy-free copier between a process memory and the Worker's mailbox in kernel memory, and the program's call import, which traps when the call ended its thread; held in each process Worker |
| [`host/dso/dolly-dso-0.wat`](../host/dso/dolly-dso-0.wat) | Optional process-local shared objects and FFI: the side-module profile and the operations of `dso@0` |
| [`host/threads/dolly-threads-0.wat`](../host/threads/dolly-threads-0.wat), [`host/threads/dolly-threads-supervisor-0.wat`](../host/threads/dolly-threads-supervisor-0.wat) | Optional `-pthread` profile and its supervisor exports |
| [`host/stack/dolly-stack-0.wat`](../host/stack/dolly-stack-0.wat) | Optional profile of a program `stack-wrap` rewrote to recurse across fresh browser stacks, and operation 116 |
| [`host/sockets/dolly-sockets-0.wat`](../host/sockets/dolly-sockets-0.wat), [`host/pty/dolly-pty-0.wat`](../host/pty/dolly-pty-0.wat) | Process operations 160-169 (local sockets) and 176-177 (pseudo-terminals), kernel-only; a pseudo-terminal's signals reach the supervisor as the kernel's raised ones; no browser import |
| [`dolly-host-0.wat`](dolly-host-0.wat) | `dolly.host` records naming required host modules and their ABI digests; no authority |
| [`host/gpu/dolly-gpu-0.wat`](../host/gpu/dolly-gpu-0.wat), [`host/audio/dolly-audio-0.wat`](../host/audio/dolly-audio-0.wat), [`host/microphone/dolly-microphone-0.wat`](../host/microphone/dolly-microphone-0.wat), [`host/nena/dolly-nena-0.wat`](../host/nena/dolly-nena-0.wat) | Additive process operations 128 (GPU), 129 (audio), 130 (microphone) and 133 (nena), and their browser imports |
| [`dolly-kernel-plugin-0.wat`](dolly-kernel-plugin-0.wat) | The resident display plugin and its registration as the terminal's input decoder; never an ordinary program target |
| [`dolly-browser-0.wat`](dolly-browser-0.wat) | The complete typed outer import allowlist of the kernel |
| [`dolly-supervisor-0.wat`](dolly-supervisor-0.wat) | Kernel exports the trusted supervisor uses, and the page's terminal mailbox (foreground, results, Ctrl+C) |
| [`dolly-image-0.wat`](dolly-image-0.wat) | Kernel exports that boot, restore, capture and stream system images; the snapshot and entry formats' numbers |
| [`host/display/dolly-display-0.wat`](../host/display/dolly-display-0.wat), [`host/input/dolly-input-0.wat`](../host/input/dolly-input-0.wat), [`host/touch/dolly-touch-0.wat`](../host/touch/dolly-touch-0.wat), [`host/http/dolly-http-0.wat`](../host/http/dolly-http-0.wat), [`host/download/dolly-download-0.wat`](../host/download/dolly-download-0.wat), [`host/upload/dolly-upload-0.wat`](../host/upload/dolly-upload-0.wat), [`host/html/dolly-html-0.wat`](../host/html/dolly-html-0.wat), [`host/snapshot/dolly-snapshot-0.wat`](../host/snapshot/dolly-snapshot-0.wat) | Browser-facing mailboxes, dispatch imports, the modules' process operations and the session mailbox |

A contract makes a boundary reviewable and lets the build derive retained exports
exactly; listing a function does not make it guest authority.

Architecture and authority: [architecture](../docs/architecture.md),
[process model](../docs/process-model.md), [browser boundary](../docs/browser-boundary.md).

## Process executables

```wat
(import "env" "memory" (memory i64 1 131072 shared))
(import "dolly_process_0" "call"
  (func (param i32 i64 i64 i64 i64) (result i64)))
;; operation, request address/size, response address/capacity
```

- Exactly those imports and `_start() -> ()`; no `dylink.0`, WASI, Fetch, DOM or
  filesystem import. A program supplies its own table, libc or allocator only if
  it needs them.
- One `dolly.process` section holds the contract digest; one
  `dolly.process.memory` section holds initial and maximum pages.
- The digest covers the contract's typed imports and exports and the SHA-256 of
  the exact bytes of [`process.h`](../include/dolly/process.h). Identity hashes exact
  bytes, so every opcode, flag or layout change necessarily changes it; no
  normalizer decides which edits are prose.
- Each linked host module client adds a `dolly.host` record
  ([`dolly-host-0.wat`](dolly-host-0.wat)) with its module's ABI digest: the
  SHA-256 of what an executable compiles against, the exact bytes of the
  module's process WAT and of its headers other than `NAME-abi.h`, and the
  constants its contracts give `NAME-abi.h`, generated as
  `DOLLY_NAME_ABI_DIGEST` ([host modules](../host/README.md)). A record whose
  digest differs from the provider's is refused like a wrong `dolly.process` stamp.
- [`generate-abi-constants.mjs`](../scripts/generate-abi-constants.mjs) derives
  JavaScript constants from `process.h` and from the WAT exported globals.
- `process.h` also holds the error numbers of every operation
  (`dolly_process_error`), so the digest covers them. A libc maps its `errno`
  to them; the build proves the bootstrap libc's numbers equal.

## Images and boot files

What a host reads to start an image, and what it hands the kernel, beside the
exports of [`dolly-image-0.wat`](dolly-image-0.wat):

- `dist/dolly-build-id.json`: `imageBuildId`, the SHA-256 of
  `dolly-image-build-1\0` and, for each of `dolly.data`, `dolly-process-0.wasm`,
  `dolly-dso-0.wasm`, `dolly-kernel-plugin-0.wasm` and `dolly-image-0.wasm`, its
  name, a NUL and its file's SHA-256; `buildId`, the SHA-256 of
  `dolly-runtime-build-1\0`, the image build ID and `dolly.wasm`
  ([`write-build-id.mjs`](../scripts/write-build-id.mjs)). An image runs only on a
  runtime with its `buildId` as image build ID.
- `dist/dolly-images.json`, the catalog: each record's `image`, `role`, `entry`,
  `dollyfile` with its `byteLength` and `sha256`, `artifacts` (the recipe's
  `FROM`, `INSTALL`, `USE` and `COPY` rows, each its `operation` in lower case,
  the input's `image`, its recipe's `location` and `sha256`, the row's `line`,
  and `source` and `destination` paths, `/` but for a `COPY`; a host follows
  `install` rows through the inputs' own records), `hostRequirements` and
  `recipesSha256`, the SHA-256 of one line `SHA256 BYTES PATH` per recipe of its
  build.
- `dist/rows/SHA256.rows`, a catalog recipe's `recipe.rows` by the recipe's
  `sha256` ([Dollyfile](../docs/dollyfile.md)): what a host writes for a build of
  that image, made by the page's one parser.
- `dist/dolly-IMAGE-system-snapshot.json`, an image's metadata, format 2: a
  reader checks `image`, `buildId`, `formatVersion` and `identityVersion` (2),
  that `recipes` digests to the catalog's `recipesSha256`, that
  `hostRequirements` equal the catalog's, that `inputs` name the catalog's
  `artifacts`, and the `manifest` of retained paths (each once, in UTF-8 order,
  with `/etc/dolly/Dollyfile`, `environment`, `image` and `recipes.lock`).
  `sha256` names the image; `byteLength` is its size.
- `dist/packs/SHA256.snapshot.gz`, the metadata's `packs` in order: each a gzip
  of one snapshot part, laid out as [`dolly-image-0.wat`](dolly-image-0.wat)
  says, with its record kinds and limits (`DOLLY_SNAPSHOT_*`): `DOLLYSNP`, a
  version and a record count, then records in path order, each a kind, a path
  length, a data length, the path (absolute and normalized) and the data; its
  `sha256` that of the decompressed part, which the host checks before ending
  the part. The parts hold the manifest's paths once each.

The host writes, under `/etc/dolly/` before a start or a build:
`image.manifest` (the metadata's manifest, a path a line), `recipe.locator`
(the recipe's site path, or `FILE:/etc/dolly/upload.Dollyfile` for a recipe
the host writes there), and for a build `recipe.rows` ([Dollyfile](../docs/dollyfile.md)),
`upload.Dollyfile` (a custom recipe's text) and `artifacts/RECIPE_SHA256.snapshot`
(each input image). It reads, after the restore, `image` (the image's name)
and `entry`, the program the image runs (`DOLLY_ENTRY_*` of
[`dolly-image-0.wat`](dolly-image-0.wat)). A session's `enabled`
([`nena.mjs`](../host/nena/nena.mjs)) lists the modules the session enabled
beyond the page's, one `NAME@VERSION` a line, which the page enables when the
session loads again.

A session file, what the sessions page exports and imports
([`session-file.mjs`](../site/session-file.mjs)): `DOLLYSF1`, a u32 length of its
metadata (at most 1 MiB), the metadata, UTF-8 JSON, then the session's bytes
(at most 8 GiB). The metadata: `version` (the Dolly release, which alone imports
it), `name`, `formatVersion` (4), `buildId`, `image`, `imageIdentity`,
`updatedAt`, `encoding` (`gzip`), `customImage` for a custom image's session,
and `byteLength` and `sha256` of the bytes that follow. The event a host takes
from `dolly_process_next_event` and a leased device's reply slot are constants
of [`dolly-supervisor-0.wat`](dolly-supervisor-0.wat).

## Enforcement

[`dolly-abi.mjs`](../scripts/dolly-abi.mjs) performs the checks; the build
([`build.sh`](../scripts/build.sh)) links to a temporary file, validates,
stamps, validates again and publishes atomically:

```sh
node scripts/dolly-abi.mjs validate-process build/dolly-process-0.wasm build/process-bin/bootstrap
node scripts/dolly-abi.mjs validate-runtime build/dolly-kernel-plugin-0.wasm dist/dolly.wasm
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm
```

The browser repeats the executable checks before instantiation with the same
parser and validator ([`wasm-interface.mjs`](../page/wasm-interface.mjs),
[`process-abi.mjs`](../page/process-abi.mjs)). The compiled WAT contract supplies
the expected types; a digest stamp alone does not establish compatibility. This
is defense in depth; host containment rests on the kernel's outer imports.

## Changing a contract

Any typed import or export, opcode, packet field, pointer width, memory limit or
lifecycle rule is an ABI change. Update the WAT, the C header, both
implementations, the contract tests and a real-browser test together. A digest
change invalidates old executables, image caches, sessions and snapshots.
