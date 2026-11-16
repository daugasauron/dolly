# The release's amy tests install packages one after another in one session, which hides missing dependencies

- STATUS: OPEN
- PRIORITY: 245
- TAGS: audit,amy,tests,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`), answering the owner's "sometimes amy install doesn't work, missing dependencies".

## State (2026-11-17)

Changed on `fix/amy` (`work/fix-amy`, commit `1d917da0b`): a step marked `fresh` begins a new
default session; `test/amy-browser.mjs` runs each such session in a page of its own, four at once
per browser, and names every package that failed. Each package installs alone, then `cc` (and
`pkgconf`) where its use compiles; the uses stand alone (fd makes its own directory, pigz needs no
gzip, tar packs with `-z`, `-j`, `-J` itself, sdl2 and sdl2-image link with pkg-config; CMake finding
their CMake packages is cmake's session). x11-window has a session; the "alone" tests (cargo, mojo,
meson, typescript) are cases now. A host that ignores `fresh` (Donna's `tests/cases.rs`) runs the
steps in one session as before.

Run on today's recipes (round1113's dist): Chromium fails raylib and x11-window (programs, 28
sessions, about 95 s) and tar (tools, 40 sessions, 68 s); Firefox fails raylib, x11-window, cargo
(programs, 130 s) and tar (tools, 78 s). Firefox's cargo: `rustc -vV` refused with "the program's
module was not provided" (`page/process-worker.mjs`'s 10 s wait for a held module), in one page
alone too, so not this test's parallelism; the audit met it once in `ff-b.jsonl`. Not an amy fault:
it is `tasks/20261116-160415-ports-11`'s rustc refusal, which then fails this test in Firefox too.

On the branch's head (`70c84705b`, with its kernel), each test run alone: amy, amy another directory,
amy cc, amy refusal and USE pass in both browsers; programs (82 s in each) and tools (54 s Chromium,
42 s Firefox) fail on the same packages (`fix-amy/final-chromium.txt`, `final-firefox.txt`).

Waits for the round: once raylib, tar, x11-libs and x11-window are rebuilt, the test must pass
(Done when); record its time in each browser then. Evidence: `work/audit-1116-evidence/recipes/fix-amy/`
(`amy-before-chromium.log`, `tools-before-chromium.log`, `before-firefox.log`, `tools-before-firefox.log`).

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
