# Copy and paste in Godot and PhotoCraft: a program reads and writes the page's clipboard

- STATUS: OPEN
- PRIORITY: 370
- TAGS: input,clipboard,godot,photocraft,owner,0.1.6

Owner (2026-11-13): "Also I want copy/paste to work in godot. Copy/paste should work in photcraft
as well."

## State (2026-11-13)

Decided and built on `feature/x11-apps` (`1abe5a768` and after):

- `clipboard@0` is a module of its own, not `input@0`: writing the browser's clipboard is a new
  authority an embedding may leave out, and a new module changes no digest of the seed. A mailbox
  without an import: the kernel keeps the text (256 KiB); the program holding the clipboard (the
  foreground command or a descendant, nesting as the input lease does, so a game the editor runs
  takes it over) writes and reads it. The page writes the browser's clipboard only while it has the
  focus and the user's activation (`navigator.userActivation.isActive`), which the copy's own key
  press or menu click gives, and reads nothing but the user's own paste: `input@0` hands each paste
  to the module, it becomes the clipboard's text, and a program holding the clipboard and the input
  lease gets the chord the user pasted with (Ctrl+V, Cmd+V, Shift+Insert), not text records, so it
  pastes as on a desktop. Contract `host/clipboard/dolly-clipboard-0.wat`, row in
  `docs/browser-boundary.md`, section in `docs/input.md`, package `libdolly-clipboard`.
- Ctrl+C reaching a program: under `ISIG` the page's Ctrl+C interrupts the foreground program,
  which killed the first test's fixture. A program that owns the keyboard clears `ISIG` on its
  terminal, as a full-screen terminal program does and as Xsdl does on the workbench branch: Godot's
  editor and Project Manager (not games, whose Ctrl+C still quits them) and PhotoCraft's window do
  so while they have the page.
- `test/clipboard-browser.mjs` passed in Chromium and Firefox (25 s each): refusals, a process
  beside the foreground refused, a child taking the clipboard over, Ctrl+C into the browser's
  clipboard, the browser's text read at Ctrl+V with no text records, and a copy made eight seconds
  after the last key press kept in Dolly (`inactive`).
- Godot: `display_server_dolly.cpp` reports `FEATURE_CLIPBOARD` and implements `clipboard_get`
  and `clipboard_set` on it (the program's own clipboard without the module). PhotoCraft: arboard's
  Dolly platform holds the clipboard for the process (`config/patches/arboard.patch`).

Left: the Godot and PhotoCraft builds with these, and their browser tests.

## Do

A clipboard a program reads and writes through a host module, the page holding it: a write from
the program goes to the browser's clipboard (`navigator.clipboard.writeText`, which needs the
page focused and, in Firefox, a user gesture: the copy's own key press can carry it); a read
answers with what the page last pasted or, inside a paste gesture, the browser's clipboard. Text
first. Decide where it lives (`input@0` or a module of its own), write the contract and its row
in `docs/browser-boundary.md`, then implement it in Godot's display server (`clipboard_get`,
`clipboard_set`, `has_feature(FEATURE_CLIPBOARD)`) and in PhotoCraft's arboard.

## Done when

In Chrome and Firefox: text copied in Godot's editor (a node's name, a script line) pastes into
another field there and into the browser outside the page, and text copied outside pastes into
Godot; the same in PhotoCraft (a layer name or another text field); a browser test for each.
