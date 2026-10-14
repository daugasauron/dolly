# What waits for the owner and the next catalog round

- STATUS: OPEN
- PRIORITY: 150
- TAGS: catalog,owner,packages,host-modules

State (2026-10-15, 04:15): the six decided items passed a round and are on
local `main` (`00caf5ec`); what is left is below. The owner (2026-10-14): "I'm not gonna go through 35
tasks, I'm sure some are not relevant anymore and some are confirmed actual
good fixes. If your investigation confirms they are fixes that improve things
and aligh with the main goal of the project go ahead. If you're uncertain,
give me a short description". So each task that waited for him was taken one
of three ways: closed with the reason where its investigation showed nothing
to change, fixed where it confirmed a fix, and described below in a few
lines where it is his call.

Done when: each item is in a round that passed, or is dropped here with the
reason.

## Fixed on 2026-10-14

Without a rebuild, each verified by the core suite in both browsers:
[Chrome's two seconds for a terminated Worker](../20261013-183624-worker-two-seconds/TASK.md),
[the kernel and the process side under `-Wall -Werror`](../20261013-212251-core-warnings/TASK.md),
[tests that matched wording where a code exists](../20261013-191218-wording-tests/TASK.md),
[eighteen exports and three other names nothing reached](../20261013-160335-stale-words/TASK.md),
[eight READMEs that said "build-only"](../20261013-161624-build-only-entry/TASK.md).

In the round of 2026-10-14, which passed (branch `integrate/round-1014`,
evidence in `build/round-1014-evidence/`; `rts` failed once with its known
early-input stall and passed alone after): [`python` without `ninja`](../20261013-132701-python-ninja/TASK.md)
and [`mojo run`'s message](../20261013-134032-mojo-run-message/TASK.md), by
his word; the parser's constant `kind` field and three comments that said
`COMPILEC`; `xonotic-build` and `wine-build` installing `freetype` in place
of thirteen `COPY` rows; CMake's sources staged under CMake's name; the six
credential header names in `docs/http.md`; the comment over Emacs's mouse
mode.

Tried and not kept:
[the large stack for Emacs](../20261013-202443-emacs-stack/TASK.md) ends its
crash under Chromium's baseline compiler and not its lost bytes (4 of 30
pinned runs).

## Decided (2026-10-14, 18:30)

The owner, on the short questions below: "Regarding next round,
yes/signoff to everything except: I don't want ot add any permission
stuff, better to use workarounds than adding permission bits." So each
recommendation stands, file modes excepted, and the work goes in this order,
since the moves of builds into packages need the first:

1. A word for what a package uses only to build
   ([build needs](../20261013-144754-build-needs/TASK.md)): installed for the
   build, kept by nothing and recorded nowhere, its modules the build's.
   Then the six packages that bring a library their program linked
   statically stop bringing it (`gzip`, `mandoc`, `pigz`, `sqlite`: `zlib`;
   `tmux`: `libevent`, `libterminfo`).
2. `amy`, Git, `download` and `upload` as packages that hold their builds,
   out of `system-tools` ([base images](../20261013-145359-builds-root/TASK.md)).
3. The modules' headers and clients out of the seed into packages
   ([module SDKs](../20261013-144241-module-sdks/TASK.md)).
4. SpiderMonkey, FreeType, libpng and libjpeg as packages with their builds
   ([builds become generic](../20261013-142800-generic-builds/TASK.md)).
5. `__dolly` documented as the page's API, no code change
   ([test surface](../20261013-144241-test-surface/TASK.md)).
6. The 17 manual pages ([man and --help](../20261005-220754-man-help/TASK.md)).

Written on branch `core/use-row` (2026-10-14), each design reviewed by a
Fable agent first, source tests passing; none built yet, since the engine
is in the seed and every image rebuilds in the round: 1 (`37a3b94b`, with
a browser test of the engine built from source), 2 (`5caa5e81`; Git stays
installed by `system-tools`, because Dolly's `patch` and `diff` run Git and
11 builds run them, which the question above missed), 4 (`3377665e`,
`c01e6852`; NetSurf in the Wine port keeps its own IJG decoder, compiled
inside a Wine module), 6 (`38099083`, checked against each program's
`--help` in a session). 3 is in review.

The round (branch `integrate/round-1014b`, worktree `work/rust`, evidence in
`build/round-1014b-evidence/`, 2026-10-14 22:37 to 2026-10-15 00:55): every
image built, source 431/0. It stopped on its suites, each failure from this
branch and none a flake: the five module packages missing from the sealed
image list (artifacts); the GPU indicator's image without the gpu client,
a `system` rebuild that now fetches `transfer`, the new packages unnamed in
amy's coverage list (core browser suite); the studio's Neovim not
highlighting `USE`; and `zero-ad-engine`, which descends from
`system-tools` and lost `download`, used by the engine and multiplayer
tests to take logs out (demos). Each fixed on `core/use-row`; the three
browser files pass in both browsers. Merged into the round branch
(`a4c15668`) with ImGui and the description; its 16 stale images rebuild,
then the suites and the GPU stage run again.

The second pass (2026-10-15 02:42 to 04:02, with `demo/x11` and
`demo/zig-llvm` merged): source 431/0, artifacts 25/0. The core browser
suite failed `amy-browser.mjs` (imgui unnamed in its coverage list) and
`site-browser.mjs` (the greeting now has two links); the demos failed
`wine-browser.mjs` (its click on "Licences and sources" landed where the
shorter greeting had put it) and `classicube-browser.mjs` (its pixel check
beside three other tests, as recorded in `demos/run-browser-tests.mjs`). The
three were fixed and each file passed alone in both of its browsers;
ClassiCube passed alone. The GPU stage passed (local-llm, SpiderMonkey, the
0 A.D. engine and graphics, Slopyard), and `zig-llvm-browser.mjs` in both
browsers; local `main` was fast-forwarded to the branch (`00caf5ec`). On
`main` as it stood at 06:30 (`ac833366`), the whole core browser suite passed
in both browsers (`browser-final.log`). On the way: SDL's timer subsystem needed a thread,
so ImGui's example never drew (fixed in `sdl2-dolly.patch`), and the X
clients lost `-ldolly-sockets` to the module packages (`x11-build` installs
`libdolly-sockets`).

Decided against: [file modes](../20261006-120641-umask/TASK.md) (no
permission bits; workarounds stay) and
[a check of the engine's module list](../20261013-170737-receipt-hosts/TASK.md).
Not now, by the recommendation: the terminal's mouse and CJK glyphs.
Done the same day: [the line discipline](../20261013-144241-line-discipline/TASK.md).

The questions as they were put:

1. [What a package needs only to build](../20261013-144754-build-needs/TASK.md).
   Six packages bring along libraries their program already linked
   statically, and SpiderMonkey as a package would bring Python, Rust and
   Cargo. It needs a new word in the Dollyfile or a build base per set of
   tools. Most of [the builds as packages](../20261013-142800-generic-builds/TASK.md)
   wait on it ([SpiderMonkey and the 0 A.D. libraries](../20261013-145359-builds-zero-ad-deps/TASK.md),
   [the views](../20261013-145359-builds-views/TASK.md),
   [the engines](../20261013-145359-builds-engines/TASK.md),
   [what is compiled twice](../20261013-145359-builds-twice/TASK.md)).
2. [`amy`, Git, `download` and `upload` out of `system-tools`](../20261013-145359-builds-root/TASK.md).
   No build uses them (searched: only `bhop` and `rts-arena` require `amy`,
   `download` or `upload`, for their sessions). As packages that hold their
   builds, a change to one reaches the images that install it, not the 114
   on `system-tools`.
3. [The modules' headers and clients in the seed](../20261013-144241-module-sdks/TASK.md).
   Those of gpu, audio, microphone, buttons and sockets are included by no
   core source; a change to `gpu.h` makes all 130 images stale, as a package
   12.
4. [The line discipline](../20261013-144241-line-discipline/TASK.md):
   done on 2026-10-14. A read under `ICANON` takes a line as typed (echo,
   Backspace, Ctrl+U, Enter, Ctrl+D); the raw read Slop and Janis use is
   unedited. Kernel only, no image rebuilt but the four of the documents.
5. [File modes](../20261006-120641-umask/TASK.md). An unchanged `configure`
   needs `umask`, `chmod +x` and `test -x`. A built branch stores nine bits
   and runs GNU Make's `configure`; it also enforces read and write bits,
   against "one user, no permission bits" of 2026-09-30.
6. [What every page ships for tests](../20261013-144241-test-surface/TASK.md):
   whether `__dolly` is the page's documented API or the tests inject it.
   Injection cannot reach the page's objects, so the accessors stay either
   way.
7. [The mouse in the terminal](../20261013-154704-terminal-mouse/TASK.md)
   and [glyphs for CJK and emoji](../20261013-154704-terminal-glyphs/TASK.md):
   features, each with a cost (page and display code; a fallback font in
   every image with a terminal).
8. [A check that the engine's module list is the page's](../20261013-170737-receipt-hosts/TASK.md):
   about twenty lines against a disagreement of the two parsers that has no
   known case.
9. [Emacs loses typed bytes at its first prompt in a fresh Chromium](../20261013-202443-emacs-stack/TASK.md),
   in 13 to 16% of runs pinned to one processor; not understood.

Only his: [the touch module's contract](../20261013-144001-touch-module/TASK.md)
(sixteen questions), [three answers](../20261012-232215-owner-answers/TASK.md),
[slopshare.dev](../20261011-134500-slopshare/TASK.md).

Measured and open: [what a round costs and what an unchanged run costs](../20260930-100000-audit-53/TASK.md)
(5.1 hours of single builds, a longest chain of 1 h 49 min; an unchanged
`npm run image -- codex` takes 80 to 87 s), and
[the two terminal flakes](../20261001-095000-terminal-text-flake/TASK.md),
not reproduced in 160 drags and about 9,000 screen reads.

## Ready for the next round

- `core/x11-fixes` (worktree `work/x11fix`, 2026-10-15): `select`, `set*id`
  to the ids a process has, and a pty master that reads EIO once its slave
  is gone, as on Linux; what the X11 port worked around. A seed change.
  `pty-browser.mjs` and `process-browser.mjs` passed in both browsers on the
  rebuilt seed. It also drops xterm's three workarounds (its patch, a
  `select` header, the launcher's kill), and `x11-browser.mjs` passed in both
  browsers on that seed (06:22); so did tmux's tests, which read pty masters
  (06:35), Python's (06:42), JavaScript's and CMake's with libuv (06:44),
  `core-browser.mjs` (06:46), `pager-browser.mjs` with `less` (06:47), and
  the man, indicators, upload, threads, terminal, display, image, ending
  and both session tests (06:53). Only the images these need were rebuilt there;
  the branch needs a full round.

## Left for a later round, none started

- Python's `os.geteuid` (the X11 port's `meson install --no-rebuild`):
  upstream's `Platforms/emscripten/config.site-wasm32-emscripten` turns it
  off, since the stub always says root and code that trusts root misbehaves;
  Dolly's ids are all 0 too, so turning it on would report root (pip warns,
  `meson install` works). `demos/python/prepare-cpython.sh` also turns off
  `setuid`, `setreuid`, `setgid` and `setregid`, which `core/x11-fixes`
  makes work. A judgment call, and a Python rebuild.

- `pty@0`: a spawn that is not the caller's child (tmux starting its own
  server, which the owner called fine as it is), a terminal recorded per
  process, `pipe-pane` ([tmux](../20261012-130814-tmux/TASK.md)).
- [Nothing can ask which program holds a terminal](../20261013-154704-terminal-holder/TASK.md):
  tmux's window names and a new pane's directory.
- `amy`: the file list without the download, `remove`, and a failed start
  naming the package (`src/slop.c`).
- Packages wanted and not made: `chmod` (waits for
  [file modes](../20261006-120641-umask/TASK.md)), `file`, and formatted
  pages for `less`, `ninja`, `posix`, Python, Emacs, Cargo, Rust, `fd`,
  CMake ([man and --help](../20261005-220754-man-help/TASK.md)).
- The fluid demo's GPU test passes in Chrome on the GPU; its Firefox half
  does not (2026-10-13, not attributed): Playwright's Firefox draws no frame
  on an Xvfb display and the wait times out; started as the installed
  Firefox, as Mojo's test does, it draws and then fails "Smoke mode did not
  change pixels".
- `gamedev-sdk` keeps its `/usr/lib/libm.a` for now. It routes thirteen
  float functions through the double ones, and whether `bhop`, the RTS and
  Slopyard give the same numbers on the libc's own was measured for one
  raylib program only.
- The memory budget for processes in place of the supervisor's count of 32,
  decided on 2026-10-01 and not built
  ([iteration cost](../20260930-100000-audit-53/TASK.md), item 2).
- The threaded build of the process side under `-Wall`
  ([task](../20261013-212251-core-warnings/TASK.md)).
