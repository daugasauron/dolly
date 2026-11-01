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

## State (2026-11-01 22:00 JST)

All 18 modules read (page and Worker sides, kernel C, clients, headers, contracts). Fixes 1
to 10 committed, each verified in Chromium and Firefox. Fixes 7 and 8 are seed changes: the
catalog needs a round (this tree rebuilt only the images its tests open, so its
`dist/dolly-images.mjs` lists those). The proposals are on branches of their own, never
on this one: P1 on `proposal/leased-device`, P2 on `proposal/host-mailbox-constants`, P4
on `proposal/snapshot-no-session-name`, each a `Proposal:` commit on fix 10; P3 waits
for the owner as described. Left open for the
owner's word on the proposals; close it when they are decided.

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
   providers say `ENODEV`. audio, microphone and nena pass in Chromium and Firefox. The rule
   is now written once (`14a0636f`, `host/README.md`), `docs/process-model.md` no longer
   says such a switch is refused, and the nena test lost its branch for a `gpu@0` refusal
   that cannot happen.
7. **Two stale contract sentences** (`20ea4768`, a seed change): `dolly-pty-0.wat` said
   byte 3 on the master is SIGINT, which is the mode's VINTR since `25867168`;
   `dolly-http-0.wat` said a URL must be absolute, which a site path need not be since
   `f9b2cb49`. Both digests change, so every program linked with either client must be
   rebuilt: a catalog round. The 28 images of `default`, `system`, `system-build`, the
   `libdolly-*` packages and `stack-wrap` rebuilt here in 1,227 s; pty, network, core,
   host-modules, nena, audio, microphone, sockets, stack, dso, threads, terminal, display,
   touch, upload, gpu-indicator, host-compute and boundary pass in Chromium and Firefox on
   them, and hardware `gpu-render` in Chrome.

8. **A frame showed its alpha** (the integrator's finding from the Studio recording
   `videos-2026-11-01/studio/s4-rubik`: a raylib program forced every pixel's alpha to 255
   before presenting, because its blended pixels showed darkened). A window's framebuffer is
   opaque; `display.h` instead said "alpha must be 255 for an opaque pixel", and the
   presenter put the frame unchanged on its `alpha: false` canvas, where Firefox premultiplies
   it (gray `0x60` in all four bytes showed as 37) and Chrome showed it white. raylib's
   software renderer, SDL's RGBA32 window surface and the cursor test's own fixture all leave
   alpha below 255. The presenter now sets the fourth byte of its copy to 255 before it paints:
   0.9 ms a 1920x1080 frame in Chrome and Firefox, beside putImageData's 0.8 and 1.1 ms (an
   RGBX `VideoFrame`, which ignores the byte natively, costs 2.7 and 3.1 ms; measured in a
   page of the test server, `exp/videoframe.mjs` in the session's scratch). `display.h` and
   `docs/display.md` say a frame is opaque; `test/display-cursor-browser.mjs` reads the
   screen and fails before the fix in both browsers. A seed change (the display digest),
   in the same catalog round as fix 7. Wine's driver sets alpha while it converts BGR, which
   it must do anyway: left.

9. **Keys typed beside Dolly's element were taken** (agent A's finding 17, forwarded by the
   integrator): `input@0` listens on the window, so every key of a text field of the
   embedding's own went to the shell and lost its default (the field stayed empty in both
   browsers), and `snapshot@0`'s Ctrl+Shift+S opened the save dialog from there. Both take a
   key only when its target is inside the element or is the body, as the page's chords do
   since A's `2562222e`; the modules' panels outside the element still claim their keys
   first through `claimsKey`, so the upload dialog's Ctrl+C still interrupts. `input@0`'s
   Paste button kept the focus after a tap, and the Enter that ran the pasted line reached
   the shell only because every key did (the touch suite hung on the rule alone): a tap now
   gives the terminal the keyboard again, as the other panels' buttons do. Page JavaScript
   only. `test/embedded-keys-browser.mjs` (A's repro) fails before in Chromium
   and Firefox and passes after.
10. **The modules' controls lay on the embedder's page** (A's finding 16): the Save button
    and dialog, the Paste button, the gpu and microphone indicators, the download offers,
    the Studio panel and the upload dialog were appended to the body and fixed to the
    window. After merging `core/audit-runtime` (its `23eb2d07` positions the element), each
    module appends its control to `mount` and places it there; a display-less embedding,
    which has no element, keeps the gpu indicator detached. Page JavaScript only.
    `test/embedding-browser.mjs` (the keys test, renamed) checks that the Save button and an
    offer lie inside a 640 by 400 element of a 1280 by 720 window: both lay outside before,
    in both browsers. embedding, upload, touch, indicators, custom-session, microphone,
    gpu-indicator, nena, host-compute, ending, terminal, core, host-modules, shell,
    session-offline, display and audio pass in Chromium and Firefox. `test/npm-browser.mjs`
    was not measured here: it boots pi-minimal, whose closure (52 images, rust-llvm among
    them) this tree has not rebuilt since fix 7's seed change, and it fails on that stale
    image.

Described, not changed (each moot or another workstream's, as it says):

- **Leased-device boilerplate in the kernel**: `host/{audio,gpu,microphone,nena}/kernel.c` are
  the same 28 lines but for names. One `call` and `release` could serve all four if
  `dolly_kernel_module` carried a context pointer (`src/process-kernel.h`,
  `core/audit-kernel`'s); a macro would hide the `dolly_NAME_mailbox_address` exports from
  grep. Left.
- **Three clients compute the same deadline** (`display_deadline`, `input_deadline`,
  `touch_deadline`). Sharing one needs a header every client includes, which is the process
  contract's (`include/dolly/`). Left.
- **`upload@0`'s and `download@0`'s clients** each build a `dolly_process_path_request`
  by hand (20 lines each), as the libc adapter's static `path_call` does. A shared helper
  would be the process contract's. Left.
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
  catalog round. It does not break "a device module imports only its own files": the
  protocol is the runtime's, as `<dolly/process.h>` and `leaseBridge` already are, and
  every device module depends on `runtime@0`. Prototyped on `proposal/leased-device`
  (one `Proposal:` commit on fix 10), choosing for the owner: the header is
  `dolly_device_header` in `runtime.h`, not `process.h`, so the process stamp and the seed
  compiler stay (in `process.h` it would be stamped, at the cost of a seed-compiler restamp
  round); one `static inline dolly_device_request()` beside it fills it for the four
  clients; the reply slots and lease rules are said once in `dolly-supervisor-0.wat`; the
  bridge checks the whole header and the providers parse only bodies; the GPU Worker, which
  reads its packets from memory itself, keeps its parse. It does not make the code smaller:
  157 lines in and 161 out outside the tests, since the one statement of the protocol costs
  what the restatements saved; its worth is one place to change it. Measured on its branch:
  see its commit.
- **P2. Mailbox values in the WAT, as `touch@0` has them.** `input@0`'s record types, modifier
  bits, composing flag and lease flags and `display@0`'s copy flags, graphics flag and cursor
  styles are enums in `input.h` and `display.h` and typed again in JavaScript
  (`static keyEvent = 1`, `(flags & 3) === 3`, `16` and `32` for Caps and Num Lock,
  `copyAvailable = 1`, `cursorStyles` by index), while the word offsets beside them come from
  the WAT and are asserted. `touch@0`'s phases are WAT globals. Smallest diff: those 40 values
  as globals in `dolly-input-0.wat` and `dolly-display-0.wat`, the enums defined from
  `*-abi.h`, the JavaScript reading `A.*`. Seed change (both headers), a catalog round; no
  behaviour changes. Prototyped on `proposal/host-mailbox-constants`: the two WATs gain 57 lines, the two headers
  lose 84 and the JavaScript gains 9; the enum type names go (no program names one). On top
  of fix 7 the 28 images rebuilt in 1,270 s, Ghostty's display library among them, and
  terminal, display, display-cursor, touch, indicators, host-modules, core, shell, upload,
  nena, boundary and pager pass in Chromium and Firefox on them, as do pty, network, sockets,
  stack, dso, threads, audio, microphone, gpu-indicator and host-compute. Moved on top of
  fixes 8 and 9 (its WAT now says a frame is opaque), with P4 after it: the 29 images
  rebuilt in 2,007 s and those 26 suites, embedded-keys, custom-session, session-offline and
  snapshot-stream among them, pass in both browsers with P2 and P4 on top of fix 9.
- **P3. A process-Worker module's bundle by its manifest.** `dso.mjs` and `stack.mjs` each
  fetch `dist/dolly-process-NAME.mjs` with the same options and register it; the manifest's
  `processWorker` field names it already. The runtime could fetch it for every enabled module
  that has one, leaving the modules their configuration. `core/audit-runtime`'s files
  (`host/runtime/runtime.mjs`, `host/modules.mjs`).
- **P4. `snapshot@0`'s mailbox without the session name.** The page writes the save's name
  into a 128-byte kernel buffer and its length into word 3 of the mailbox, and the kernel
  validates it a second time and drops it: what it fed, a marker file in `/home/dolly`, went
  in `5afba99c` because nothing read it. The page keys its saves by the name it validated
  itself. Prototyped on `proposal/snapshot-no-session-name`: the buffer, its export, the
  word and the kernel's check go, 41 lines in, 83 out; not an image input (image inputs
  unchanged), and custom-session, session-offline, snapshot-stream, nena, indicators and
  boundary pass in Chromium and Firefox.

## Lessons

- A contract's prose is its identity. `DOLLY_NAME_ABI_DIGEST` hashes every byte of a
  module's WAT and headers, comments included, so the two stale sentences found here
  (`pty@0` interrupting on "byte 3", `http@0` URLs "must be absolute") cost a full catalog
  round to correct: every program linked with the http client is refused until rebuilt.
  Gather contract-prose fixes and land them with a round that happens anyway.
- Moves leave dead members behind. The page/Worker split (`30dc877d`) left the Worker's
  `InputTransport.relativePointerRequested()`; the getters that the per-module manifests
  (`fe9cac9a`) gave http's, audio's and gpu's page sides outlived their readers; and the
  process modules' `threads` flag, made general for a second module, never met one that
  says no. Each looked used because a test or a comment names it. After a move, list the moved code's members and
  grep each against its callers.
- One rule for missing devices, written once. `gpu@0` learnt that a module should be
  admitted and fail OPEN where the browser has no device (`07c6b08a`); `audio@0` and
  `microphone@0` kept the older refusal for a week because the rule lived in a commit
  message. Where a rule spans modules it belongs in `host/README.md`.
- A program's workaround is the core's bug report. The raylib program in the Studio
  recording forced alpha to 255 because `display.h` told it alpha mattered; the cursor
  test's own fixture had presented a translucent gray for weeks, and no test looked at the
  screen, only at `__dolly.frame()`, the presenter's copy. A test of what a display shows
  must read the screen (a screenshot of the canvas), not the bytes the page was given.
- Read a commit back before trusting it. A `git add` with one path that no longer existed
  (the test file `git mv` had renamed) added nothing, its error hidden by `2>/dev/null`,
  and the commit held only the rename; `git show --stat` after every commit caught it.
- The harness: this tree's `dist/` came from `work/x11fix`, two demo recipes ahead of
  `main`, so `npm run routes` refused until those two recipes matched; a docs edit
  repins twelve recipes (the docs package and the pi family that installs it), and the
  source suite checks the working tree's pins, so an uncommitted docs edit fails it. The
  installed Firefox is a snap and does not start inside a capped `systemd-run` scope, so
  hardware WebGPU in Firefox cannot be measured on this machine.
