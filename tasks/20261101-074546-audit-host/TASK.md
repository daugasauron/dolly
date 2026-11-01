# Audit: the host modules

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,audit,host-modules

Owner (2026-11-01): a complete audit of the core source to make it stable, small, lean and
nice, solved from first principles. This task covers each host module, the bridges between
the Wasm userspace and the browser: every `host/NAME/` but `runtime` (and the loading
machinery `host/{manifests,modules,requirements,abi}.mjs`, `core/audit-runtime`'s), their
clients and headers that the seed carries, their docs and tests. Branch `core/audit-host`
from `main` 577aafb1, tree `work/audit-host`.

Asked of every module: does it do one thing; is its contract small, typed and versioned; are
its shapes consistent with the others; does a path grant authority it should not or skip a
quota; duplication with another module or the page core; dead code, workarounds, special
cases; do its tests prove denied access and behaviour rather than spelling.

## State (2026-11-01 17:40 JST)

Survey of all 18 modules done (page and Worker sides, kernel C, clients, headers, contracts).
Fixes in progress below; findings that are proposals for the owner at the end.

## Findings

Method: every module's page and Worker sides, kernel C, client, header and contract read in
full; `git log -S` before each removal; the modules' browser tests run in Chromium and
Firefox before (`build/audit-host-evidence/baseline-1.log`: audio, microphone, nena, upload,
display, touch, network, all pass) and after each change.

The perimeter holds: no path found that grants authority a module's row in
`docs/browser-boundary.md` does not name, or that skips a quota. Each Worker side copies a
guest span only after checking it against the memory's current length, re-reads
`memory.buffer` after growth, and validates before any side effect; each new resource kind
is counted (GPU textures in the 4 GiB with buffers, query sets bounded by the 8 scopes, the
download Blobs by 4 offers of 1 GiB, the package service by 64 snapshots). Device modules
import only their own files, as `host/README.md` says (checked by grepping every module's
imports).

Fixed:

1. **GPU Worker by number** (`5c0079b6`). `records()` and the request check compared opcodes
   with literals (`opcode === 2`, `[1,2,3,18,20,21,22,24,25,26].includes(op)`) beside named
   constants elsewhere in the file; now named Maps and Sets of the generated constants,
   checked equal to the literals they replace by evaluating both. `CREATE_BUFFER` checked the
   object quota a second time, the same predicate on unchanged state: gone. Hardware
   `gpu-render` in Chrome passes with every boundary proof true.
2. **Unused `status` getters** on the page sides of `audio@0` and `gpu@0` (`5c0079b6`): the
   registry never reads it and no module `get`s another's; one test read it and reads the
   page handle's `audio` now.
3. **`threads` flag of process-Worker modules** (dead since `efa91478`): `b0ed0ecc` let a
   module served in the process Worker say whether it serves threads, and the supervisor
   refused a threaded program a module that did not. `dso@0` said yes, and `stack@0` since
   it came; nothing says no, so the flag and the refusal go
   (`src/process-supervisor.mjs`'s `#admit`, two lines: `core/audit-runtime`'s file).

## Proposals for the owner

## Lessons
