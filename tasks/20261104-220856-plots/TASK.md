# Matplotlib plots shown in the terminal: confirmed and documented

- STATUS: CLOSED
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

## Findings

- Upstream first: kitcat 2.0.2 (MIT, PyPI) is a Matplotlib backend that writes
  kitty escapes itself; on Dolly it would ask XTGETTCAP and XTVERSION on
  `/dev/tty` (libghostty-vt answers `libghostty`), fall to its basic path and
  show the figure at its own size. Not taken: the owner wants no backend, since
  `savefig` and an escape already show it.
- Ghostty's source (83fb9562, `src/terminal/apc.zig`) buffers up to 65 MiB of
  one kitty APC, and answers a transmission only when it names an id or a number
  (`graphics_exec.zig`), so `a=T,f=100` with neither needs no `q=2`.
- Measured in Chromium (`build/plots-evidence/probe.mjs`, 1280x800, cells 8x26):
  one unchunked escape shows a 20 KB PNG of Matplotlib's default figure at the
  cursor at 640x480, a 76 KB one at 300 dpi (clipped at the screen's edge), and
  a 2.9 MB PNG of noise (3.9 MB of base64) in one escape: the terminal needs no
  4096-byte `m=1` chunks. `c=40` alone scales the 640x480 figure to 320x240, the
  aspect kept. The prompt returns on the row below the image.
- `amy`'s recipe on integrate/2026-11-05 pinned `version.h` at 0.1.4's bytes; a
  build repins it (e7a471fda here), as the candidate round's will.

## Closed, 2026-11-05

Confirmed: in python-data, `savefig` then the README's print line shows the plot
in the terminal. `demos/python/test/python-data-browser.mjs` runs the README's
three lines and reads the canvas where the 640x480 figure lands (white corners,
Matplotlib's first colour on its line, the terminal's background past its right
edge) and finds the prompt below it: passed in Chromium (20.6 s) and Firefox
(22.2 s) on python-data built at image inputs 4ae12d73; with the print line
replaced, it fails ("the display never showed what was awaited"). Commit
4ff014615. No recipe or image change: nothing to rebuild for it.

## Lessons

- The terminal already did it: a plot is a PNG and the terminal shows PNGs. Ask
  what is missing before choosing between building a backend and a command; two
  changes of direction cost the first half hour.
- A tree whose runtime is a newer seed than its snapshots cannot open them: the
  checkout server refuses stale inputs. Twelve images rebuilt in 20 minutes
  (python-data-build 9 minutes); check `buildId` against
  `dist/dolly-image-build-id.mjs` before the first browser run.
- A pixel check needs its negative: the same test without the escape failed,
  which is what makes the passing run evidence.
