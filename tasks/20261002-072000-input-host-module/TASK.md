# Keyboard and mouse as their own host module

- STATUS: OPEN
- PRIORITY: 320
- TAGS: core,architecture,host-modules,display,input

Owner direction (2026-10-02): "I feel like mouse/keyboard should be a host
module."

## Today

Input belongs to `display@0`. The page side is `host/display/input.mjs`
(237 lines: keys, pointer, wheel, focus, IME text, paste, clipboard chords,
fullscreen and pointer lock). The guest side is `dolly_input_event`
(128-byte records, 256 per ring) in `host/display/display.h`, read through
`dolly_display_next_event` from the display mailbox; `host/display/kernel.c`
also feeds the terminal line discipline from the same records. A program that
wants keys or the pointer must take the whole display contract, and a display
cannot exist without the input authority.

## Expected

An `input@0` module per `host/README.md` (directory, manifest, WAT contract,
client, kernel part, row in `docs/browser-boundary.md`) owning keyboard,
pointer, wheel, focus and IME text, with its own records and ABI digest.
`display@0` keeps frames, presentation and the terminal device. Images declare
`REQUIRES HOST input@0` explicitly, as Dollyfile 6 requires, so an image that
only draws grants no input and a headless image can still read keys. Decide
where clipboard, paste, fullscreen and pointer lock belong (each is browser
authority) and record why.

## Done when

- Input is its own module with its own contract and digest; `display@0` names
  no input; the terminal reads keys through `input@0`.
- Every image that reads input declares `input@0`; the core and demo browser
  tests (terminal, SDL2 games, Slopyard, 0 A.D., Neovim, Emacs) pass in Chrome
  and Firefox.
- `docs/browser-boundary.md` lists exactly what `input@0` grants.

Coordinate with `20261001-000000-host-modules` (same files).

## Plan (2026-10-02, `core/host-modules-2`)

Taken as the seed/ABI round after the host-modules contract batch
(`0095054c`), not folded into it: it is a contract redesign that needs its own
verification, and the externally built 0 A.D. engine must be recompiled for
it (`demos/zero-ad/toolchain/engine.patch` calls `dolly_display_next_event`),
not relinked as that batch does.

1. Contract `host/input/dolly-input-0.wat`: an input mailbox (event ring and
   its words, paste buffer and sequences) and the records of `input.h`
   (`dolly_input_event` moves there unchanged); operations ACQUIRE, NEXT_EVENT
   and RELEASE. The input lease replaces the display lease as the raw-input
   gate: while a foreground program holds it the terminal does not consume
   the ring; graphics programs acquire display and input separately.
2. Resize is surface geometry, not input: the page publishes it to the
   display mailbox (size, scale, font size under a sequence) and the display
   kernel feeds the driver from there; programs learn the size from the
   display surface. Decide when porting SDL2 whether a size record stays in
   the ring for one release.
3. Kernel `host/input/kernel.c` from `host/display/input-ring.c` plus the
   lease and NEXT_EVENT; the terminal line discipline reads keys through an
   input hook that hands records to the resident decoder (`display@0`'s
   driver) without the display kernel naming input.
4. Page `host/input/input.mjs` from `host/display/input.mjs`: keys, pointer,
   wheel, focus, IME text, paste and pointer lock (relative motion and
   capture, gated by a trusted canvas press) are input authority; clipboard
   copy of the terminal selection stays with the display (it reads the
   driver's copy buffer); F11 fullscreen is page chrome and moves to the shell.
5. Every image that reads input declares `input@0`; ports: SDL2
   (`demos/sdl2/SDL_dollyvideo.c`), Slopyard, 0 A.D. (engine recompile),
   Neovim and Emacs through the terminal; `docs/browser-boundary.md` row and
   `abi/dolly-browser-0.wat` (no new import: a mailbox module).

## Review note (2026-10-05, `20261005-131642-big-picture`)

This is a seed round: every image, the Rust seed and a 0 A.D. engine
recompile, about 3.5 h of builds. Put the other pending seed changes in the
same round instead of paying it again: the target identity
(`20261005-133402-target-identity`, if the owner decides it), steps 3 and 4
of `20261005-133401-kernel-boundary`, and the seed batches of
`20261005-131643-silent-126` and `20261005-131650-userspace-gaps`.

## Note from the presenter work (2026-10-06, `20261005-131644-page-presenter`)

The page now counts a record the ring cannot take (`data-input-dropped`), but a
program cannot see the count, and a key release dropped at 256 unread records
leaves that key down until it is pressed again. The `input@0` contract should
carry a dropped-counter word. All ring logic sits in `DisplayTransport`'s
producer methods; `input.mjs` was not touched.

## Design (2026-10-06, `core/input-module`)

Re-audit of the plan against `integrate/userspace-next` (`7976b8ea`). Where it
differs from the plan, the reason is given.

### Contract `host/input/dolly-input-0.wat`, `input.h`

- Kernel exports `dolly_input_mailbox_address`, `dolly_input_paste_buffer_address`.
  No import: a mailbox module, so `abi/dolly-browser-0.wat` is unchanged.
- Mailbox: seven atomic u32 words, then 256 records of 128 bytes at byte 28.
  `EVENT_READ` (kernel), `EVENT_WRITE` (page), `FLAGS` (kernel: `LEASED`, a
  program reads the records; `POINTER_RELATIVE`, it asks for pointer lock),
  `PASTE_SEQUENCE`, `PASTE_CONSUMED_SEQUENCE`, `PASTE_LENGTH`, `ENABLED` (page:
  1 while it listens; without it `ACQUIRE` is `ENOSYS`, as in a build or for a
  program that calls the operation without the client), and the paste buffer
  (256 KiB) beside it.
- Records: `dolly_input_event` keeps its size and type numbers (bhop's
  recorded timelines hold them). `width_css_px`/`height_css_px` become
  `int32_t x, y`; the two resize-only fields become reserved zero words.
  Type 3 (resize) is gone. New type 11 `DROPPED`.
- `SCROLL` no longer carries terminal rows (the page divided by the terminal's
  cell height, which input cannot know): `action` is the wheel's own unit
  (pixel, line, page, as `WheelEvent.deltaMode`), `y` the delta in thousandths.
  The terminal's decoder converts with its cell height exactly as the page
  did; SDL2 and the games convert at 26 CSS pixels a line, what a wheel step
  was worth to them at the default font.
- **Dropped counter: a record, not a word.** A word in the mailbox tells a
  program that records were lost but not where: it would let go of its keys
  on the next read and then read the 255 older presses still queued, leaving
  them down again. The page instead keeps the ring's last slot for one
  `DROPPED` record (`action`: records lost since boot), written where the
  first lost record would have been; a second one follows only after later
  records. A program lets go of keys and buttons when it reads it.
- Operations 88–91: `ACQUIRE`, `NEXT_EVENT`, `SET_POINTER` (relative on/off),
  `RELEASE`. The plan had three; pointer lock was requested through the
  display's cursor (`DOLLY_DISPLAY_CURSOR_CAPTURED`), which would leave a
  draw-only image able to ask for it.
- `dolly_input_decoder`: how the resident terminal turns records and a paste
  into the bytes its programs read. The display library registers it itself
  (`dolly_input_decoder_install`, one new import of
  `abi/dolly-kernel-plugin-0.wat`), so neither `display.h` nor the display
  kernel names a record. The plan handed records through the display driver's
  `handle_event`, which keeps the record type in `display.h`.

### Authority

| What | Owner | Why |
| --- | --- | --- |
| Keys, IME text, paste, window focus | `input@0` | records |
| Pointer buttons, position, wheel, presence | `input@0` | records; positions are canvas pixels |
| Pointer lock and relative motion | `input@0` | granted only on a trusted canvas press while the lessee asks; Escape, release or exit ends it |
| Surface size and scale | `display@0` | geometry: the page publishes it under a sequence in the display mailbox, the kernel feeds the driver on its tick and raises SIGWINCH when the grid changes (font zoom included, which raised none before) |
| Clipboard copy of the terminal selection | `display@0` | it reads the driver's copy buffer; the chord reaches it as a claimed key of the one keyboard listener, so a display-only image copies nothing |
| F11 fullscreen, Ctrl+Shift+F indicators | page shell (`src/page-chords.mjs`) | page chrome: taken before any module sees the key |

### Lease rule

- No lease: the terminal reads the ring. Keys, text and paste go through the
  decoder to the foreground program's stdin; pointer and scroll records are
  the terminal's own (selection, scrollback) and are handled ahead of unread
  keys on the display's tick, before it draws; a terminal a graphics program
  covers ignores them.
- `dolly_input_acquire`: the foreground program or a descendant, one at a
  time. It then reads every record; the terminal reads none (its own replies,
  such as a cursor report, still reach stdin). The page sends all buttons,
  presence and pastes as text, and wakes the reader on each record.
- Release, exit or forced termination: unread records were that program's and
  are dropped. A foreground program that retires without a lease loses its
  unread keys while the terminal keeps its pointer and scroll records
  (`dolly_input_ring_discard(ring, terminal_ui)`, kept).
- Display and input leases are independent: SDL2 takes both; a program may
  draw and read stdin, or read records and leave the terminal on screen.

### What `display@0` loses

The event ring and its words, the paste buffer and words, `NEXT_EVENT`,
`DOLLY_DISPLAY_CURSOR_CAPTURED`, every `dolly_input_*` name, the resize record
and `input-ring.c`. Driver v5: `initialize` (no paste buffer), `write`, `read`
(replies), `resize`, `present`, `set_suspended`. It gains four surface words.
No graphics program read the resize record, so none stays in the ring.

### Images

- A terminal image declares `input@0` beside `display@0`; so does a package
  whose programs read records (`sdl2`). The `display` package does not:
  installing it grants no input.
- Display only: no page listener writes a record, the terminal shows output
  and reads no key, and a program linking the input client is refused before
  it runs (`host module input@0 is not declared by this image (REQUIRES HOST)`).
- Input only (headless): keys, text, focus and paste reach a program that
  takes the lease; without a display library there is no decoder, so stdin
  gets none and unread records stay queued (256, then counted as dropped).
  No pointer records: there is no canvas.

### Process contract

`process.h` and `dolly.process` are unchanged: operations are module globals
and no core packet names the display. Changed identities: the `display@0` and
`input@0` digests and the kernel-plugin digest. Shared files touched:
`src/process-kernel.h` (terminal hooks), nothing in `process-kernel.c`.
The seed changes (header, client archive), so every image rebuilds.

### Touch (`20261005-222057-touch-input`), later

New record types in `input.h` (contact down, move, up, cancel) using `x`, `y`
and the two reserved words for the contact id; page listeners; the decoder's
mapping to scroll and selection; SDL2's to its touch events. No mailbox or
operation change, but the digest changes, so it is a seed round.

## Implementation (2026-10-06, `core/input-module`)

Branch `core/input-module`, on `integrate/next` (`bef23f6b`) with
`fix/corner-indicators` merged (its chord moved to the page shell).

- `host/input/`: `dolly-input-0.wat`, `input.h`, `ring.c` (the ring: take,
  the terminal's service, discard), `kernel.c` (lease, the terminal's reader,
  decoder registration), `client.c`, `input.mjs` (the one keyboard listener,
  the ring's producer with the loss mark, pointer lock).
- `host/display/`: no ring, records, paste buffer or `NEXT_EVENT`; four
  surface words; driver v5; the page publishes the surface and claims the copy
  chord (only for keys typed at the terminal, not into a module's dialog).
- `abi/dolly-kernel-plugin-0.wat`: one import, `dolly_input_decoder_install`.
- `src/process-kernel.h`: the terminal hooks are split by owner (output and
  replies: display; read, ready, input service, discard: input). No other
  shared core file changed; `process.h` is untouched.
- `src/ghostty/display.c`: driver v5 and the decoder; pointer and scroll are
  ignored while a graphics program covers the terminal; the dead F11 case is
  gone.
- `src/page-chords.mjs`: F11 and Ctrl+Shift+F. `src/terminal-text.mjs`: the
  screen-text helpers tests use, over both modules' page APIs
  (`__dolly.transport` is the display's, `__dolly.inputTransport` the input's).
- Ports: `demos/sdl2/SDL_dollyvideo.c`, the raylib glue in `gamedev-sdk`,
  Slopyard, the fluid demo, Airtime and its agent, the test fixtures.
  `demos/zero-ad/engine.patch` does not call the display API (0 A.D. reads
  input through SDL2), so it is unchanged; its chain only needs rebuilding.
- Recipes: every recipe that declared `display@0` except the `display`
  package now declares `input@0` (38); `system-build` installs the header.

Decisions made while implementing:

- The presenter no longer wakes on input (it did so to have its frame loop
  running before the echo). A new frame wakes it through the Worker's notify;
  the difference is at most the first echo after 250 ms of silence. Not
  measured: measure key-to-paint before and after if it matters.
- SIGWINCH is raised from the display's tick when the published grid differs
  from the last one told, instead of from resize records.
- A module claims one key with `"key"` (the display's copy chord); the guest
  keeps its held keys, which a UI's claim releases.
- `SCROLL` consumers convert at 26 CSS pixels a line and 30 lines a page
  (SDL2, Slopyard); the terminal uses its own cell height and rows.
- Airtime's recorded input log keeps its format: a wheel delta is still
  logged as the record's action.

## Verification

Run so far (2026-10-06, branch at `5753b391`; logs under
`build/input-evidence/`, not committed):

- `npm run build:runtime`: passes. The kernel implements the kernel-plugin
  contract with the new import, exports exactly what its contracts declare and
  has exactly the outer imports of `abi/dolly-browser-0.wat` (unchanged).
  Runtime `023ff5a8…`, image inputs `fa06044c…`.
- `DOLLY_PROCESS_ABI_DIGEST` is `db75b7ca…`, the same as in the integration
  trees (`work/next`, `work/round2`): `dolly.process` did not change.
  New digests: `display@0` `0a004910…`, `input@0` `88451810…`, kernel plugin
  `fdd2fac4…`.
- `node --test test/*.test.mjs 'demos/**/*.test.mjs'`: 404 pass, 0 fail.
  New there: `test/input-ring.test.mjs` (records and the loss mark in JS; the
  ring's service and discard rules and the kernel's reader, lease, paste
  handshake and `ENOSYS` in C, compiled natively from `host/input/ring.c` and
  `kernel.c`), `test/display-transport.test.mjs`.
- `node --test test/dolly.artifacts.mjs`: the eleven kernel and contract
  tests pass; the three that read image snapshots wait for rebuilt images.
- `npm run lint:dollyfiles`: 63 recipes.
- Native syntax checks with the pinned upstream headers: `src/ghostty/display.c`
  (Ghostty, stb), `demos/sdl2/SDL_dollyvideo.c` (SDL2 2.32.10), the raylib glue
  and Airtime from their recipes (raylib), Slopyard's `main.c` (raylib, Box3D,
  Lua). None of these has been compiled for Dolly yet.

Not run yet: every image build and every browser suite.

### Browser results on the base before the nine-import kernel

Base `607dc7b1` (`integrate/next` before kernel-boundary steps 2 and 4),
branch at `5753b391` plus the pins this build wrote; runtime `023ff5a8…`,
image inputs `fa06044c…`. These do not count for the merge: the branch has to
be merged onto `fb6c3463` and rebuilt once.

- `DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,system work/slot.sh build npm
  run image`: 13 images in 1015 s, `ghostty-build` among them, so the display
  library compiled against driver v5 and linked the new plugin import.
- Chrome 151, through `work/slot.sh browser`: `core` 46.9 s, `terminal` 35.3 s
  (with the new SIGWINCH, draw-only and both-lease cases), `display` 15.8 s
  (with the loss mark and the ruler drag across a retiring program),
  `boundary`, `process`, `shell`, and `indicators` 7.8 s on the `system` image
  (the suite needs `cc`; `fb6c3463` names that image).
- `host-modules` in Chrome: its existing cases pass; the two new ones (an
  image without `input@0`, an image with only `input@0`) did not run: they
  install the `cc` package, which was not built.
- Not run on this base: every suite in Firefox (the run was queued behind
  other agents' browser slots and stopped), `cc`, `sdl2`, `bhop` and their
  demo tests, `test:artifacts` on rebuilt images, the echo-latency
  measurement.

Paused from 23:10 to 00:05 for `fix/selection-after-exit` (the neovim demo
failure; `tasks/20261001-095000-terminal-text-flake`). Its two fixes are on
this branch too: the repeated screen-reading gesture lives in
`src/terminal-text.mjs` here, the discard at the owner's exit is unchanged in
`src/process-kernel.c` and reaches `host/input/kernel.c`.

### On the nine-import kernel (`fb6c3463`), 2026-10-07

- Merged `fb6c3463`. This module adds no kernel import: `npm run
  build:runtime` passes `validate-browser` ("exactly the typed imports"), and
  the exact-exports artifact test accepts `dolly_input_decoder_install` as the
  kernel-plugin contract's import. Runtime `a6b03265…`, image inputs
  `4305d230…`.
- `node --test test/*.test.mjs 'demos/**/*.test.mjs'`: 405 pass, 0 fail.
- `DOLLY_BUILD_IMAGES=default,system,cc,sdl2`: built in 2086 s (00:54,
  `image-chain-2.log`); no browser suite ran on them before the session ended.

## State on 2026-10-07 (morning, `82fa0cff`, before the round3 merge)

- Implemented and committed: everything the implementation section lists.
  `display.h` holds driver v5 and the four surface words and names no record:
  the session ended at "Now display.h" with the tree clean, and the header is
  consistent with the design, so nothing was left half-edited there.
- Verified on the nine-import kernel (`fb6c3463`): `build:runtime`
  (`validate-browser` passes), the source suite, four images built.
- Verified only on the older base (`607dc7b1`), Chrome only: core, terminal,
  display, boundary, process, shell, indicators.
- Never ran anywhere: any browser suite on `fb6c3463` or later; any suite in
  Firefox; host-modules' two new cases (`cc` package); the `sdl2`, `bhop` and
  neovim demo tests, which are the programs that read input through the
  module; `test:artifacts` on rebuilt images; the echo-latency measurement.
- Not yet on `integrate/round3` (`40418a7b`): expected merge conflicts in
  `host/display/display.mjs` (main's repeated gesture, `ac4b4e5d`, lives in
  `src/terminal-text.mjs` here), `src/process-kernel.c` (main's `0ebf7356`
  and this branch's `0f37f0bf` make the same discard at exit),
  `test/{terminal,display,host-modules}-browser.mjs`, `host/manifests.mjs`
  and `test/host-modules.test.mjs` (`dso@0`, the operation-number test),
  `docs/browser-boundary.md`, and the pins of 59 recipes.
