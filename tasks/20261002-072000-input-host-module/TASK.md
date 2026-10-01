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
