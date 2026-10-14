# What waits for the owner and the next catalog round

- STATUS: OPEN
- PRIORITY: 150
- TAGS: catalog,owner,packages,host-modules

State (2026-10-14, 10:00). The owner (2026-10-14): "I'm not gonna go through 35
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

In the round of 2026-10-14 (branch `integrate/round-1014`, evidence in
`build/round-1014-evidence/`): [`python` without `ninja`](../20261013-132701-python-ninja/TASK.md)
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

## His call, each in a few lines (2026-10-14)

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
4. [The line discipline](../20261013-144241-line-discipline/TASK.md).
   Programs that read a line from the terminal (`unzip`'s question, `cat`,
   Python's `input()`, Slop's `read`) show nothing typed, Enter does not end
   the line and Ctrl+D ends nothing. The kernel had one in the first commit;
   it fell out unreachable, not by decision.
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

## Left for a later round, none started

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
