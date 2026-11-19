# The release's amy tests install packages one after another in one session, which hides missing dependencies

- STATUS: CLOSED
- PRIORITY: 245
- TAGS: audit,amy,tests,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`), answering the owner's "sometimes amy install doesn't work, missing dependencies".

## State (2026-11-19)

The 0.1.8 round (unit `dolly-round-018k`, `integrate/0.1.8` at 8d666a4e4, `work/integrate-018`,
`build/round/suites.log`) ran every package's case in a page of its own (`test/amy-sessions.mjs`,
four at once), the core's in `test/amy-browser.mjs` and each demo's in its
`test/amy-browser.mjs`. All passed but one, in Chromium and Firefox (s):

| Test | Chromium | Firefox |
| --- | ---: | ---: |
| core: amy programs, amy tools | 5.3, 15.8 | 7.4, 24.1 |
| demos: pi, codex, javascript, cmake, tmux | 11.4, 9.4, 15.6, 12.9, 8.8 | 14.2, 13.9, 19.8, 19.7, 13.9 |
| emacs, neovim, sdl2, gtk, local-llm | 6.4, 8.0, 20.5, 6.7, 1.2 | 8.8, 13.9, 23.8, 8.4, 2.2 |
| mojo, rust, slopyard, x11, xonotic, zero-ad | 15.9, 14.2, 12.4, 8.6, 4.7, 15.6 | 21.1, 18.0, 15.3, 11.2, 6.4, 19.8 |
| tools | 90.4 | over 900: stopped |

That is 284 s of Chromium and 262 s of Firefox without tools' Firefox run. Left: tools' Firefox
run, which hung past its 900 s (`fix/rc-core` investigates it), and the core test's last
assertion, which failed on `clip`, a core package that no case installed yet (`fix/rc-core` adds
the case). This closes when both pass.

## Merged on 2026-11-17

Merged into `integrate/0.1.8` (02b7ba436). On `ws/recipes` (`work/recipes`), with raylib, tar,
x11-libs and x11-window rebuilt, the sessions of the packages it found missing a dependency now
pass alone, in Chromium and Firefox: raylib and x11-window ("amy programs", 14.7 s and 19.1 s for
the two) and tar ("amy tools", 2.2 s and 3.9 s), run through a copy of the test that keeps the
named sessions (`work/audit-1116-evidence/recipes/ws-recipes/scratch-test.sh`, `PACKAGES=`;
`logs/a-programs.log`, `logs/a-tools.log`). Before the fixes the same sessions failed
(`fix-amy/amy-before-chromium.log`, `tools-before-*.log`).

## Found

`test/amy-browser.mjs` runs `test/cases/amy-programs.json` (46 steps) and `amy-tools.json` (140
steps) each in one `default` session: every `amy install NAME` lands on top of what the earlier
steps installed, and its use passes if any earlier package brought what it needs. The final
assertion ("packages that no test installs and uses") counts a package as tested when a case
installs it, whatever was installed before it.

The audit installed each of the 169 packages of the full catalog alone into a fresh `default`
session in Chrome (headless, `work/round1113/dist/`), adding only `cc` (and `pkgconf`) where the
use compiles, then ran what it installs. Three packages fail alone that pass in the release's
sequence, each a missing dependency:

| Package | Alone | Why the release's test passed |
| --- | --- | --- |
| `raylib` | `dolly/raylib.h` includes `dolly/display.h`, not found (`20261116-141253-recipes-01`) | `sdl2`, installed earlier, brought `libdolly-display` and `libdolly-input` |
| `tar` | `tar -z`, `-j`, `-J`: `posix_spawnp gzip: No such file or directory` (`20261116-141504-recipes-02`) | `pigz`, `gzip` and `bzip2` came earlier |
| `x11-window` | its header includes `dolly/input.h`; linking needs Xlib (`20261116-141504-recipes-04`) | not tested in a session: the test lists it as "godot and photocraft link it" |

Others the release tests only after an earlier step: `sdl2` and `sdl2-image` are built with the
`cmake` installed before them (alone with `cc` and `pkgconf` they pass), `pigz`'s step pipes into
`gzip`, `fd`'s reads the directory `ripgrep`'s step made.

Of the 169, 163 install and work alone in both Chrome and Playwright's Firefox; the six that do not
fail the same way in both (raylib, x11-window, libxkbfile, stack-wrap, scons, xterm: their tasks are
the `audit,recipes,0.1.8` ones). No install failed intermittently across the two runs
(`amy-results.txt`, one line per package and browser).

What a fresh session per package costs, measured: 154 packages under 300 MB in 561 s of Chrome
time (3.6 s a package, 0.35 s of it the boot; two pages at once took about 5 min), the 15 larger
ones (go, llvm, rust, lean, the models, zero-ad-data) 700 s. The release's two sequential tests
take 77 s in Chromium (`work/round1113/build/round-1117-evidence/browser.log`).

Evidence: `work/audit-1116-evidence/recipes/run-a.jsonl`, `run-b.jsonl`, `run-big.jsonl`,
`retry.jsonl` (Chrome), `ff-a.jsonl`, `ff-b.jsonl`, `ff-big.jsonl` (Firefox): one JSON line per
package, each step's command, status, time and output; `INDEX.txt` lists the rest.

## Do

In `test/amy-browser.mjs`, run each install-and-use pair of the two case files in a page of its
own (Playwright's `browser.newPage()` is a fresh context; several at once in one browser),
installing the package alone and then only `cc`/`pkgconf` where its use compiles; keep one
sequential session for what tests interaction (already-installed packages, one pin per recipe,
the saved session). Make each use self-contained (no file another step made, no tool another
package brought). `tasks/20261116-140514-core-05` moves the demo packages' cases into their demos'
tests; the fresh session per package holds wherever the cases end up.

## Done when

The test, run on today's recipes, fails on `raylib` and `tar` alone, and passes once
`20261116-141253-recipes-01` and `20261116-141504-recipes-02` are fixed; its time in each browser
is recorded here.

## Closed (2026-11-20)

Round 018n (`282bc58c4`) passed both that were left: `demos/tools/test/amy-browser.mjs` in
Firefox in 71.6 s (Chromium 57.0 s), where it had hung past 900 s, and `test/amy-browser.mjs`
with its last assertion, no package that no case installs. Log: `work/evidence-2026-11-20/round-018n/``suites.log`.
