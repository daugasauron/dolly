# Page indicators cover the image's buttons: show them for ten seconds, then on a key

- STATUS: OPEN
- PRIORITY: 330
- TAGS: page,ux,gpu,sessions

Owner (2026-10-06): "the GPU/save load indicator in the bottom left should
only be visible for like 10 seconds on page load, then add some keybinding
(documented) to toggle it. Currently it's blocking functionality (buttons get
hidden behind the info)."

Today the page keeps its own elements over the display for the whole session,
in fixed corners: the GPU indicator (`#gpu-status`, `host/gpu/gpu.mjs`: fixed
at the bottom right, above everything the guest draws), the session control
(`#session-open`, `host/snapshot/ui.mjs`: "Save · not saved", bottom right),
and the downloads and build panels (`terminal.html`: `#downloads` bottom left,
`#image-build` bottom right). A program that draws its own buttons there
(ClassiCube's "Quit game", the game overlays, Studio) has them covered, and
guest frames cannot move the page's elements by design.

## Work

- The status indicators (GPU adapter, session state) show when the page
  loads and hide after about ten seconds; one documented key chord toggles
  them. Pick a chord the terminal and the catalog's programs do not use and
  that browsers do not reserve (the page already takes `Ctrl+Shift+C`/`V`,
  `Ctrl+Shift+S` and `F11`); the chord is handled by the page before the
  guest sees it, like those.
- Keep what the indicators are for: they are trusted page text that a guest
  cannot cover or forge. So a state the user must not miss still shows
  without being asked: no GPU or a software adapter, a refused module, a save
  in progress or failed, a download or upload waiting for the user's click.
  Decide which states re-show the indicator, and for how long, and say so.
- While shown, the indicators must not take clicks meant for the image where
  they carry no control (`pointer-events`), and the ones that are controls
  (Save, a download's button) need a place that does not sit on the image's
  corners, or the same show-on-demand rule.
- Document the chord where the others are (`README.md`, `docs/sessions.md`,
  `docs/gpu.md`) and keep `docs/browser-boundary.md` exact.

Page code only: no kernel, ABI or seed change, and no image rebuild.

## Done when

- On a fresh load the indicators are visible, gone after about ten seconds,
  and the chord shows and hides them; shown by a browser test in Chrome and
  Firefox that also clicks a guest-drawn control in the bottom corners
  (ClassiCube's "Quit game" is the reported case).
- The states listed above still surface on their own, covered by the
  existing GPU-indicator and session tests.
