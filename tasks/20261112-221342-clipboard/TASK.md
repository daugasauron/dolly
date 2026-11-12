# Copy and paste in Godot and PhotoCraft: a program reads and writes the page's clipboard

- STATUS: OPEN
- PRIORITY: 370
- TAGS: input,clipboard,godot,photocraft,owner,0.1.6

Owner (2026-11-13): "Also I want copy/paste to work in godot. Copy/paste should work in photcraft
as well."

## State (2026-11-13)

Filed. What there is today:

- The page pastes into a program as typed text: Ctrl+V and the Paste button read the browser's
  clipboard inside the user's gesture and push the text to the program's input
  (`host/input/input.mjs`, `docs/input.md`). Nothing lets a program read the clipboard when it
  asks, or write it.
- Godot asks its display server, `clipboard_get` and `clipboard_set`: Dolly's says "Clipboard is
  not supported by this display server" (the owner's log, `20261112-221342-godot-editor`), so
  neither Ctrl+C nor Ctrl+V works in the editor's fields, script editor or inspector.
- PhotoCraft's clipboard is arboard, which on Dolly reports that it has none (`arboard.patch`,
  `demos/photocraft/README.md`); a paste reaches the app as text.

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
