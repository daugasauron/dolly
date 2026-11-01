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

## State (2026-11-01 17:20 JST)

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
   (`src/process-supervisor.mjs`'s `#admit`, two lines: `core/audit-runtime`'s file),
   `2dc47392`. dso (threaded FFI), stack (a threaded program `stack-wrap` rewrote) and threads
   pass in Chromium and Firefox.
4. **Members the page/Worker split left unread** (`00e69e65`): the Worker's `InputTransport`
   kept `relativePointerRequested()` after `30dc877d` moved that decision to the page, which
   decides on the flags the Worker reports; `http@0`'s page side kept a `transport` getter no
   module reads. terminal, network and core pass in Chromium and Firefox.
5. **Docs** (`1f2d522b`): `host/README.md` said `browser()` and `worker()` both receive the
   page's resources (the Worker side gets `runtimeBase` and `abi`, the page side also
   `claimsKey` and `surfaceSize`) and left out `serviceDeferred()`, which `gpu@0` uses;
   `docs/display.md` linked each of two recipes twice since `5ec4783c` replaced the `.dm`
   module that stood beside each.
6. **Two device modules refused by their `check()`** (`3c324b42`): `audio@0` without
   `AudioContext` and `microphone@0` without `getUserMedia` and `AudioWorkletNode` refused the
   module and so every image declaring it, while their providers refused OPEN with `ENOSYS`
   in the same case. No browser that runs Dolly lacks those APIs, so the checks never
   refused; where one would, `gpu@0`'s rule (`07c6b08a`: admitted, grants nothing, OPEN
   fails with `ENODEV`, a program falls back) is the one to keep. The checks go, the
   providers say `ENODEV`. audio, microphone and nena pass in Chromium and Firefox.

Described, not changed (each moot or another workstream's, as it says):

- **Leased-device boilerplate in the kernel**: `host/{audio,gpu,microphone,nena}/kernel.c` are
  the same 28 lines but for names. One `call` and `release` could serve all four if
  `dolly_kernel_module` carried a context pointer (`src/process-kernel.h`,
  `core/audit-kernel`'s); a macro would hide the `dolly_NAME_mailbox_address` exports from
  grep. Left.
- **Three clients compute the same deadline** (`display_deadline`, `input_deadline`,
  `touch_deadline`). Sharing one needs a header every client includes, which is the process
  contract's (`include/dolly/`). Left.
- **`__dolly.transport`** (`display@0`'s page record) is a view of what the Worker last
  reported, not a transport, and doubles `graphicsActive`, `fontSize` and `copySelection` on
  the same handle; 40 uses in tests and demos. Renaming is churn without a defect. Left.
- **`input@0` reads `display@0`'s cursor** (`canvas.style.cursor === "default"`) to know that
  a program asked the terminal for the mouse (`09b50fa6`, chosen so as to add no mailbox
  word). A graphics program that shows the arrow then also holds back the canvas's context
  menu; nothing else follows, since without the input lease such presses reach a terminal
  that ignores them. Moot.
- **`snapshot.h`** restates the snapshot contract's sizes by hand and only its total size is
  asserted, where `upload@0` and the others assert every word against the generated header:
  a kernel-only module has no generated C header (`scripts/generate-abi-constants.mjs` writes
  `NAME-abi.h` only for a listed header, which the seed would then install). Left.
- **The leased devices' page sides** (`audio.mjs`, `microphone.mjs`, `nena.mjs`) repeat the
  same request, revoke and complete handlers around `leaseBridge`, and each provider parses
  the packet header the bridge has half checked: see P1.
- **Hardware GPU in Firefox is not measurable here**: `test/gpu-render-browser.mjs` launches
  Playwright's Firefox, which gets no adapter under Xvfb (`docs/gpu.md`), and the installed
  Firefox (a snap) does not start inside the capped scope (`gpu-render-2.log`, 180 s launch
  timeout). Chrome's hardware run is the GPU Worker's measurement tonight.

## Proposals for the owner

- **P1. One contract for the leased-device protocol.** `gpu@0`, `audio@0`, `microphone@0` and
  `nena@0` speak one protocol: a 32-byte header (version, operation, scope, sequence, body
  length, reserved), a reply slot of a 64-byte header (state, scope, sequence, errno, length)
  and its bytes, a scope never reused, sequences that only increase, `dispatch(NULL, scope)`
  to revoke. It is written down eight times: in prose in each of the four WATs, as C in
  `src/device-lease.{h,c}`, as JavaScript in `host/runtime/lease-bridge.mjs` and again in the
  GPU Worker's `header()` and `publish()`; each of the four clients builds the header by hand
  (`u32(packet, 0, VERSION)`…, 14 lines each) and each page provider parses it again (audio,
  microphone, nena). Smallest diff: `abi/dolly-device-0.wat` beside the supervisor contract,
  exporting the header and reply offsets; `device-lease.h`, `lease-bridge.mjs` and the GPU
  Worker use its generated constants; the bridge checks the whole header (the version is in
  the lease descriptor) and hands a provider `{ operation, scope, body }`; one
  `static inline dolly_device_call()` in a runtime header replaces the clients' `call()`; the
  four WATs name the protocol instead of restating it. Every client's digest changes: a
  catalog round.
- **P2. Mailbox values in the WAT, as `touch@0` has them.** `input@0`'s record types, modifier
  bits, composing flag and lease flags and `display@0`'s copy flags, graphics flag and cursor
  styles are enums in `input.h` and `display.h` and typed again in JavaScript
  (`static keyEvent = 1`, `(flags & 3) === 3`, `16` and `32` for Caps and Num Lock,
  `copyAvailable = 1`, `cursorStyles` by index), while the word offsets beside them come from
  the WAT and are asserted. `touch@0`'s phases are WAT globals. Smallest diff: those 40 values
  as globals in `dolly-input-0.wat` and `dolly-display-0.wat`, the enums defined from
  `*-abi.h`, the JavaScript reading `A.*`. Seed change (both headers), a catalog round; no
  behaviour changes.
- **P3. A process-Worker module's bundle by its manifest.** `dso.mjs` and `stack.mjs` each
  fetch `dist/dolly-process-NAME.mjs` with the same options and register it; the manifest's
  `processWorker` field names it already. The runtime could fetch it for every enabled module
  that has one, leaving the modules their configuration. `core/audit-runtime`'s files
  (`host/runtime/runtime.mjs`, `host/modules.mjs`).

## Lessons
