# Seed commands: tar restores modification times, sleep takes a fraction, cc passes -Wp

- STATUS: OPEN
- PRIORITY: 180
- TAGS: core,commands,seed

Three workarounds in recipes that a seed command's missing behaviour caused. Decided 2026-11-04
(`tasks/20261102-133353-owner-decisions`): yes to all three; each is a workaround the mechanism
deletes. One seed change, one round (with the Zig 0.17 round of `tasks/20261103-102041-zig017` if
it comes first).

1. **tar.** `src/commands/tar.c` restores no modification times (nothing in it sets a time), so
   every extracted source tree looks new to make, and Emacs's recipe compiles a 12-line
   `utimensat` program to make the release's generated files current
   (`tasks/20261102-133232-recipes-apps`, S2). Restore each member's mtime, a directory's after its
   members, as every tar does; Emacs's helper goes.
2. **sleep.** The catalog's `sleep` is sbase's (`Dollyfile-posix:45`), whole seconds
   (`estrtonum`), so ghostty-x11 and x11-desktop poll `until test -e /tmp/.X11-unix/X0 || test
   $tries = 3000` with up to 6000 `test` spawns, since `sleep 1` would cost a second of start-up
   (recipes-apps F4). A `sleep` of the core (`src/commands/sleep.c`: a decimal number of seconds,
   `nanosleep`, as GNU, BSD, toybox and busybox take it), built where `test.c` and `echo.c` are;
   posix stops exporting sbase's. The two loops become `until test -e …; do sleep 0.1; done`.
3. **cc -Wp.** `src/commands/cc.c` does not pass `-Wp,ARG` to the preprocessor. Zig asks
   `cc -E -Wp,-v` (and `cc -print-file-name`) for the libc's directories, so
   `demos/zig/Dollyfile-zig-llvm:37-46` writes `/usr/lib/zig/libc.txt` by hand and exports
   `ZIG_LIBC`. With `-Wp,` passed (and `-print-file-name` checked), Zig finds libc itself and the
   file and the variable go (found by zig017).

Done when: `tar -xf` gives files their recorded times, checked natively in `test/tar.test.mjs`
and in `test/core-browser.mjs`; `demos/emacs` has no `utimensat` helper and its generated files
are current after the build (make rebuilds nothing); `sleep 0.1` returns within 100 to 200 ms in
Chromium and Firefox and the two X loops use it; `cc -E -Wp,-v -x c /dev/null` prints the include
directories; `libc.txt` and `ZIG_LIBC` are gone from `Dollyfile-zig-llvm` and
`demos/zig/test/zig-llvm-browser.mjs` passes in both browsers on the rebuilt zig.

## State (2026-11-04)

Work on `core/seed-commands` (`work/signals`), on `integrate/2026-11-03` (seed `e7867504…`).

- **tar** (94955e0f1) restores each member's modification time from its ustar header (access
  times left as GNU tar leaves them), a directory's after the members created in it; Emacs's
  `utimensat` helper is gone. Every `scripts/build-source-tar.mjs` archive records time 0, so a
  tree extracts with one time, which is what the helper gave Emacs. A malformed time field is
  refused as a malformed size is; every tar writes one, so the test fixture now does too.
  Checked: `test/tar.test.mjs` (fails on the old tar: 1793753995 s, the extraction time, for
  1200000000), `test/core-browser.mjs` in Chromium (23.7 s) and Firefox (34.0 s), a file's and its
  directory's recorded times through `stat -c %Y`. Emacs rebuilt without the helper compiles the
  same 163 units and generates the same 31 files (`GEN` lines) as this morning's build with it:
  no Lisp is bootstrapped. `demos/emacs` tests pass (Chromium 6.3 s, Firefox 8.3 s, the package
  on default 7.5 s).
- **Python's recipe** had a second tar-time workaround, `touch Python/frozen_modules/*.h`
  (since its first commit, 2c9a3fcb9): the headers' prerequisites are `Lib` modules and
  `Programs/_freeze_module.py`, from the same archive. It goes (c81eab3bc): CPython built
  without it compiles the same 261 outputs, and `demos/python`'s tests pass (python 37.5 s in
  Chromium; python on default 156.9 s and 209.8 s in Chromium and Firefox; python-data not
  built here).
- **sleep** (2f990d503, check fixed in 995a8c0f1) is a core command (`src/commands/sleep.c`,
  built in `system-build` beside `test` and `echo`, exported by `core`): a decimal number of
  seconds read to the nanosecond, then `nanosleep` until it has passed; anything else is refused
  (status 2). sbase's goes from `system-tools` and `posix`. Measured, ten runs each through
  Slop's `time`: `sleep 0.1` 105–108 ms in Chromium, 109–115 ms in Firefox; `sleep 0` (process
  start) 4–5 and 8–11 ms; `sleep 1` 1005–1006 and 1009–1015 ms.
- **The X loops** become `until test -e /tmp/.X11-unix/X0 || test $tries = 600; do sleep 0.1;
  …; done`: a minute at most (9f262cbce). They need it beyond the spawns: with `test` a Slop
  builtin (`core/slop-language`) the old loop would end in milliseconds, before the server has
  its socket. `demos/x11/test/x11-browser.mjs` passes in Chromium (first window 3.0 s after
  navigation; 2.4–2.6 s in the rounds of 3 November, on a less loaded machine: page ready 2.8 s
  against 2.2–2.4 s) and Firefox (4.2 s). ghostty-x11 is not rebuilt here (zig-llvm-build takes
  the 9 GB slot): the round's step.
- **cc -Wp,ARG** (3e10e208e): the option parser is the driver, `src/compiler.cpp` (`cc.c` only
  forwards to it), so the fix is there, beside `-Wl,`: each comma-separated ARG goes to cc1. It
  reaches images only with a new seed compiler (`llvm-cc` built and pinned).
- **What `-Wp` removes, measured.** Zig 0.17's `LibCInstallation.findNative` on an Emscripten
  host (Zig in Dolly is one) asks cc only `-E -Wp,-v`, for the headers; `-print-file-name` (the
  crt directory) it asks on Linux, Haiku and Serenity alone, so cc needs nothing for it (it still
  refuses it as an unknown option). A probe in default after `amy install zig`, with no
  `ZIG_LIBC` (it applies from the next load), in Chromium and Firefox alike
  (`build/signals-evidence/zig-probe.mjs`): with today's cc, `cc -E -Wp,-v` lists no
  `/usr/include` and `zig build-obj -ofmt=c` fails; with a cc that passes `-Wp,-v` on as `-v`
  (what 3e10e208e's driver does), both `zig build-obj -ofmt=c` and a native
  `zig build-exe -ofmt=c` succeed. The C backend returns before Zig's crt step
  (`Compilation.zig:2376`), so **the `zig` package's `libc.txt` and `ZIG_LIBC` can go once the
  seed compiler has the driver.**
- **zig-llvm's file stays.** It names what detection cannot: `sys_include_dir=
  /usr/include/wasm64-emscripten`, Emscripten's headers, which Ghostty's `imgui_demo.cpp`
  includes under the `__EMSCRIPTEN__` Zig defines (`emscripten/version.h`; detection takes the
  last search directory holding `stdlib.h` and the last holding `sys/errno.h`, `/usr/include` for
  both). And its backend links: `Compilation.create` resolves crt paths for an executable that
  links libc and refuses an empty `crt_dir` ("libc installation is missing crt directory",
  `resolveCrtPaths`), which `zig-llvm-browser.mjs`'s native `zig build-exe` would hit (read in
  the source, not measured: zig-llvm-build needs the 9 GB slot).

## What the round does

- **Rebuild everything**: `system-build` changed (tar.c, sleep.c), so every image does; and
  check `ghostty-x11` (not built here: `zig-llvm-build` needs the 9 GB slot) with
  `demos/ghostty-gtk/test/ghostty-x11-browser.mjs`.
- **The compiler round for `-Wp`.** `llvm-cc` built from this branch links the new driver; the
  round's `pin-seed-compiler.mjs` records it (`seed-compiler-next.diff`), and pinning it makes
  `-Wp` real. Not done here: `llvm-cc` needs this seed's `llvm-build`, which the day round had
  not reached (it comes after the Lean chain in its heavy stage), and building it here takes about
  an hour beyond a 6 GB slot's likely memory. Once pinned:
  - `test/cpp-browser.mjs`'s build-system probes get
    `"cc -E -Wp,-v -x c /dev/null 2>&1 > /dev/null | grep -qx ' /usr/include'"`;
  - `Dollyfile-zig` drops `/usr/lib/zig/libc.txt` and `ZIG_LIBC` (its page says Zig asks cc
    for the headers), and the amy test's zig row its `export ZIG_LIBC=…` and comment;
  - `demos/ghostty-gtk`'s cc wrapper drops its `-Wp,-v` → `-v` mapping;
  - zig-llvm's `libc.txt` comment says what it is for: Emscripten's headers and the crt
    directory Zig does not look for on this host.

## Lessons

- The brief and the task named `src/commands/cc.c` for `-Wp`; `cc.c` is 17 lines that forward
  every option to the driver in `src/compiler.cpp`. Reading the 17 lines first turned "a seed
  command change" into "a compiler round", which changes what can be verified in a day.
- "A hand-written libc.txt is a workaround the driver's missing option caused" was half true.
  Zig's own source (`LibCInstallation.findNative`, `Compilation.create`) and one probe with a
  10-line cc wrapper that does what the driver change will do settled it in minutes, before any
  compiler round: the C-backend package's file goes, zig-llvm's carries two other things. A
  wrapper that emulates an unbuilt fix is a cheap way to test a decision's premise.
- A check must fail when its input is missing. The first sleep check redirected the output of
  Slop's `time` keyword, which reports on the shell's stderr, so awk read an empty file and
  passed. tar's check was run against the old tar first and failed as it should; the sleep check
  was not, and only a probe that printed the numbers showed it measured nothing.
- The checkout server refuses to start when a recipe differs from the built catalog: editing
  recipes to split commits while browser tests ran failed all three. Split commits before or
  after a browser run, never during one.
- A demo test that installs a package needs that package in the narrowed catalog: x11's test
  types into xterm after `amy install tmux`; without tmux the keystrokes went to a plain shell
  and the test failed at its last step, far from the cause. Read a failing test's screenshot
  before suspecting the change.
