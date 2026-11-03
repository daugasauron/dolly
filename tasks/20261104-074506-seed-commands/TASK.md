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
