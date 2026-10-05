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
