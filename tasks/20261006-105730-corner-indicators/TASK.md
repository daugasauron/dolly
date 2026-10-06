# Page indicators cover the image's buttons: show them for ten seconds, then on a key

- STATUS: CLOSED
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

## Decisions (2026-10-06)

- **Owner.** `src/page-indicators.mjs`, part of the page shell, owns the one
  timer and the shown/hidden state (`html[data-indicators]`, one CSS rule in
  `terminal.html` over the class `page-indicator`). Modules contribute by
  giving their element that class and, for a state the user must not miss, by
  holding (`holdIndicators(name, held)`); none has a timer. The shell starts
  the ten seconds when the page is ready (ENTRY started), not at navigation,
  so a slow boot does not eat them. The chord is taken in
  `host/display/input.mjs` beside `F11`, because that capture listener is the
  one place that decides what the page takes before a record is written for
  the guest; a second listener in the shell would depend on registration
  order.
- **Chord: `Ctrl+Shift+F`.** A terminal emulator's own chords are
  `Ctrl+Shift+letter` (programs cannot tell them from `Ctrl+letter` without
  an extended keyboard protocol), so no catalog program binds one. Of the
  letters, Chrome or Firefox bind A B C D E G H I J K M N O P Q R S T W X Y Z
  (several, such as N T W Q, never reach a page), `U` is GTK's Unicode entry
  and `L` is a common password-manager autofill; `F` is bound in neither
  browser's shortcut list. **Not measured in a headed browser:** the test
  drives the page's key events in headless Chrome and Firefox, which shows
  the page's handling, not what a browser window's own shortcuts take
  first. If `Ctrl+Shift+F` does not reach the page on the owner's desktop,
  the letter is one `"KeyF"` in `host/display/input.mjs` plus the docs. The page takes the F's
  keydown and its keyup, so the guest reads only the modifiers, as it does
  for `Ctrl+Shift+C`.
- **What shows by itself.** Every indicator for ten seconds when the page is
  ready, and for ten seconds when the GPU adapter state changes (so a
  software adapter is shown at load and whenever the GPU Worker's device
  differs from the page's check). Held until resolved: no GPU adapter (stays;
  it carries the enable link), a save from its start until it succeeds (a
  failed one stays until a later save succeeds), a download being prepared or
  waiting for its click. When the last hold ends they stay ten more seconds.
  The chord hides them even while held; the next state change shows them.
  A refused module still stops the boot with the reason in the bootstrap
  log, and saves still report in `#session-status` at the top right; both
  are unchanged. There is no unsaved-session reminder today.
- **Guest reach.** None of this is reachable from Wasm. The GPU provider
  reports an adapter on every device open, so the indicator reacts only to a
  changed state, not to each report. The one guest request that shows the
  indicators is the existing bounded download offer; nothing a guest does
  hides them.
- **Clicks.** The GPU indicator is `pointer-events: none`; only its "How to
  enable WebGPU" link takes clicks. Save and the download buttons are
  controls and follow the same show-on-demand rule instead of moving.
- **Save stays discoverable.** It shows on load with the rest, the chord
  brings it back, and `Ctrl+Shift+S` saves while it is hidden; both chords
  are in `README.md`.
- **Not changed: `#image-build`.** The Studio build panel appears only for a
  build the user starts, stays while it runs and has its own Close; it is
  not in the group, so the chord does not hide it. It was left out because
  no Studio image for this source is in this tree to verify a change with.
- **The test's delay.** `test/indicators-browser.mjs` installs Playwright's
  page clock and advances it, so the page has no delay parameter and no
  test-only API. The fixture `test/fixtures/corner-control.c` leases the
  display in `default` in place of ClassiCube, whose image in this tree is
  stale; it exits 5 unless it reads Escape.

## Result (2026-10-06, commit `7ecc1466`)

Chrome 151.0.7922.71 and Firefox 155.0, headless, each command inside
`systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0`; logs in
`build/indicators-evidence/`.

- `node test/indicators-browser.mjs chromium firefox`: passed in both
  (4.3 s, 5.1 s). Save shown on load, still shown five seconds on, hidden
  at ten; the chord shows and hides it; with it hidden, presses at the
  bottom left and at the Save button's place reach the fixture, and with it
  shown the same press opens the Save dialog and does not reach the
  fixture; the fixture reads the modifiers of both chords and exactly the
  one plain `f`; a waiting download and a failed save outlast the ten
  seconds, and the indicators leave ten seconds after the offer is
  dismissed and after the save succeeds.
- The test fails when it should: with the chord's key passed on to the
  guest ("the guest read the chord's key: ... KeyF, ... KeyF, KeyF"), and
  with the shell's call at ready removed ("the indicators outlived their
  ten seconds"). Chrome only; sources restored and compared afterwards.
- Existing suites on the same code, both browsers: `gpu-indicator-browser`
  (software; software then unavailable when the GPU Worker gets no adapter;
  unavailable without WebGPU in Chrome and in Firefox), `custom-session-browser`,
  `core-browser` (which clicks a download offer), `terminal-browser`,
  `display-browser`, `boundary-browser`: all passed. `node --test
  'test/*.test.mjs'`: 277 passed, 0 failed.
- A first version of the test lost the plain `f` in Chrome: it typed right
  after closing the Save dialog, when focus was back on the Save button and
  the dialog's close event had not yet returned it to the keyboard
  (`debug.log`). This work does not change that listener. The test now
  waits for the keyboard to have focus.

This tree had no generated routes, and its image registry did not list
`gpu-sdk`, so the GPU suite could not start. `DOLLY_BUILD_IMAGES=default,system,minimal,gpu-sdk,gpu-fluid
npm run routes` generated the pages from `terminal.html` and rewrote
`dist/dolly-images.mjs` and `dist/dolly-packages.txt` for those images
(the earlier copies are `build/indicators-evidence/dolly-images.before.mjs`
and `dolly-packages.before.txt`). No runtime or image was built.

Left: the headed check of the chord above; `#image-build` as decided; the
reported ClassiCube button itself was not run.
