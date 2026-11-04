# Matplotlib plots shown in the terminal: confirmed and documented

- STATUS: OPEN
- PRIORITY: 300
- TAGS: python,display,demo,0.1.5

The owner, 2026-11-05: "How about the confirm on plotting matplotlib plots in the
terminal?" Nobody had confirmed it. The terminal already shows PNGs sent as kitty
graphics escapes with direct transmission (`t=d`, `docs/display.md`), as Pi sends
them. Nothing is missing: an agent saves the figure with `savefig` and writes the
file to the terminal itself. No backend, no new command, no recipe change (the
owner, after two changes of direction: "Youre saying the terminal can already
render png files, then what is missing? Why are you building stuff?").

Done when `demos/python/test/python-data-browser.mjs` saves a figure, writes it to
the terminal from Python, and reads the canvas pixels where the plot lands, in
Chromium and Firefox; and `demos/python/README.md` has the snippet.

## State, 2026-11-05

The README's snippet and the test's check are written; the source suite passes
(475). The tree's python-data snapshot was built with the confirming round's
seed (88959af6) while its runtime is the candidate's (4ae12d73), so the checkout
server refuses it: python-data, python-data-build and ten packages beside them
are building in a build slot at 4ae12d73 (`build/plots-evidence/images.log`).
Then: the probe (`build/plots-evidence/probe.mjs`, not committed) and the test,
in Chromium and Firefox.

## Findings

- Upstream first: kitcat 2.0.2 (MIT, PyPI) is a Matplotlib backend that writes
  kitty escapes itself; on Dolly it would ask XTGETTCAP and XTVERSION on
  `/dev/tty` (libghostty-vt answers `libghostty`), fall to its basic path and
  show the figure at its own size. Not taken: the owner wants no backend, since
  `savefig` and an escape already show it.
- Ghostty's source (83fb9562, `src/terminal/apc.zig`) buffers up to 65 MiB of
  one kitty APC, and answers a transmission only when it names an id or a number
  (`graphics_exec.zig`), so `a=T,f=100` with neither needs no `q=2`.
