# What a host depends on is in a contract: malloc, boot-control files, the image directory, mailbox words

- STATUS: CLOSED
- PRIORITY: 360
- TAGS: abi,architecture,donna,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A3). `AGENTS.md`: "The core interface must remain small, typed,
inspectable, and versioned."

## Closed (2026-11-14)

Donna (2026-11-14), against the 0.1.6-rc (main `79c143f66`, release `e1c400a5…`): the snapshot and
entry limits now come from `dolly-abi.json`'s runtime constants, as every mailbox word, packet
size, errno and process constant already did; the boot files and the image directory follow
`abi/README.md`'s documented format; its build ID is `dist/dolly-build-id.json`'s `imageBuildId`,
which it reads instead of recomputing (keep that file and field stable). 125 of its tests pass,
also on an empty module cache, and the 13 images it builds match the release byte for byte. The C
asserts the same constants (`build/generated/dolly-kernel-contracts.h`, `include/dolly/image-abi.h`).

## State (2026-11-13, seed round)

On `round/0.1.6-seed` (8075755b5, the fixture cdae6a2bd): a snapshot part's and the entry's
numbers are globals of `abi/dolly-image-0.wat`: `DOLLY_SNAPSHOT_VERSION` 2,
`DOLLY_SNAPSHOT_HEADER_BYTES` and `_RECORD_HEADER_BYTES` 16, `_RECORD_DIRECTORY` 1, `_FILE` 2,
`_SYMLINK` 3, `_DELETED` 4 (sessions only), `_MAX_PATHS` 100,000, `_MAX_MEBIBYTES` 2,048,
`_PATH_MIN_BYTES` 2 and `_PATH_MAX_BYTES` 4,095, `_SYMLINK_MIN_BYTES` 1 and `_SYMLINK_MAX_BYTES`
4,095; `DOLLY_ENTRY_VERSION` 1, `_HEADER_BYTES` 16, `_MAX_ARGUMENTS` 256, `_ARGUMENT_MAX_BYTES`
4,096, `_MAX_BYTES` 65,536. Decided: the size bound is in MiB, since an i32 global holds no 2^31
(`i32.const 2147483648` assembles and reads back as -2147483648, measured with the pinned wasm-as);
no constant for the counts' minimum of one (zero is no entry, no image).
Where they reach: `include/dolly/image-abi.h`, generated and listed by the runtime's manifest, so
also in the seed's `/usr/include/dolly`; `kernel/fs-record.h` includes it, so the kernel's restore,
stream and capture (`kernel/system-snapshot.c`, its own enum gone) and the Dollyfile engine's
layer reader and entry writer (`programs/dollyfile.c`) take them, and session-recover builds with
it in the image. `host/runtime/abi.mjs` and `dist/dolly-abi.json` (`modules.runtime.constants`)
carry them for JavaScript: `page/snapshot-records.mjs` (now the one encoder and decoder of both
headers; `page/packaged-snapshot.mjs` and `scripts/share-pages-snapshots.mjs` had copies),
`page/image-entry.mjs`, `scripts/pack-seed.mjs`, `scripts/system-snapshot-format.mjs`,
`site/image-artifact.mjs`. `abi/README.md` names the constants where it gave the numbers.

Image inputs: `98bc4c57…` with the hygiene merge, `e855bf8c…` after the layout move, `79275cdf…`
with these constants (runtime `0ffd0fea…`); `DOLLY_BUILD_IMAGES=default,system` built on it in
901 s (`build/seedbatch-image-1.log`), dolly-docs and libdolly-pty added for the site and pty
suites. Evidence under the tree's `build/`: `npm run -s test:source` 467 of 467
(`seedbatch-source-abi-2.log`); artifact tests all but "dist registers every image", for the
narrowed catalog (`seedbatch-artifacts.log`); the npm runtime package's 88 files resolve every
import inside it (`seedbatch-npm-closure.log`; the one URL outside is the site's `custom/run/`
route, as before the move). Browser suites, Chromium and Firefox, all passed: process, shell,
slop, console, threads, core, terminal, cpp, host-modules, display, upload, embedding,
custom-session, site, boundary (`seedbatch-suites-1/`, `-1b/`, `-1c/`), pty and image
(`seedbatch-suites-2/`; pty needs libdolly-pty in the catalog now, image needed the fixture's
name). default stops at its first check for the catalog alone: its welcome names `amy install
python`, which this catalog does not build. The seed is reproducible: a second checkout of
15c5fa3ef with an empty Emscripten cache and no process sysroot builds the same runtime and image
inputs (`build/seedbatch-repro-runtime.log`). Left: Donna reading them from `dolly-abi.json`.

## State (2026-11-13)

Donna's answer (2026-11-13): it reads every mailbox word, packet size, errno and process constant
from `dolly-abi.json`; it typed by hand, from `abi/README.md`, the boot files, the image directory's
paths and fields, and it had to read from code what the contract left out. Now in the contract
(`fix/audit-0.1.6`):
- `abi/dolly-supervisor-0.wat`: the event's packing (`DOLLY_PROCESS_EVENT_KIND_SHIFT` 48,
  `_VALUE_SHIFT` 32, a 16-bit value) and a leased device's reply slot (`DOLLY_DEVICE_HEADER_BYTES`,
  `DOLLY_DEVICE_REPLY_HEADER_BYTES`, the five words, `DOLLY_DEVICE_REPLY_PUBLISHED`); the kernel
  packs events with them and asserts its reply struct against them, the lease bridge and the
  supervisor use them. The kernel built from it is byte for byte the one before (`9707352e…`); image
  inputs unchanged (the supervisor contract is not one).
- `abi/README.md`: a snapshot part's record kinds, widths and limits (100,000 paths, 2 GiB), the
  entry's widths and limits, `recipe.locator`'s `FILE:` form, `enabled`'s lines, and the session
  file (`DOLLYSF1`, its metadata's fields, limits and format 4). `dist/rows/` came with
  `fix/catalog-rows`.
The snapshot's and entry's numbers belong in `abi/dolly-image-0.wat`, an image input: they go there
with the next seed round. Left: Donna switching to them (told).

## State (2026-11-12)

On `fix/batch`, for the pass after the batch round (a contract WAT is a pinned document):
- 1: `malloc` and `free` are exports of `abi/dolly-supervisor-0.wat`: a thread's mailbox, a
  terminal line and a boot file's bytes are kernel memory the host fills or reads. A
  mailbox-only export would replace one allocator call with another.
- 2 and 3: `abi/README.md`, "Images and boot files": the build ID's computation, the catalog
  record, metadata format 2 with what a reader checks, the packs, and each `/etc/dolly/` file the
  host writes or reads. Paths stay text: a WAT exports integers only.
- 4: `build/generated/dolly-kernel-contracts.h` holds every kernel-boundary contract's constants
  (`generate-abi-constants.mjs`); `src/dolly.c` and `host/snapshot/kernel.c` assert their
  mailboxes' words against them, as upload's do. On the way: the snapshot contract's
  `DOLLY_SESSION_HEADER_SIZE` (64, the mailbox) shared its name with a save's 16-byte header in
  `src/session-records.h`; it is `DOLLY_SESSION_MAILBOX_HEADER_SIZE` now, and `snapshot.h` copies
  no constant.
Left: Donna reading these from `dolly-abi.json` and the README (told).

## Found, and do

1. The supervisor allocates each process's mailbox with `kernel.malloc`/`free`, exported only as
   the Ghostty plugin's imports (`abi/dolly-kernel-plugin-0.wat:16-19`). A supervisor export
   allocates and frees the mailbox; boot files use the existing transfer ranges.
2. The host writes or reads `/etc/dolly/recipe.locator`, `recipe.rows`, `upload.Dollyfile`,
   `image.manifest`, `artifacts/N`, `image`, `entry`, `environment`, `enabled`, described in
   comments only. Their paths become constants of `abi/dolly-image-0.wat` (so `dolly-abi.json`
   carries them) and `abi/README.md` gives a paragraph per file.
3. The image directory (`dolly-images.json`, `dolly-NAME-system-snapshot.json` format 2, pack
   naming, the build ID's computation) is written down as a contract in `docs/`, with the fields a
   reader must check.
4. `DOLLY_TERMINAL_WORD_*` and `DOLLY_SESSION_WORD_*` are generated with an `offsetof` check as the
   process structs are.

## Done when

Donna types none of these by hand (its `images.rs`, `nena.rs`, `supervisor.rs` read them from
`dolly-abi.json` or the documented format), and a source test checks each against the C.
