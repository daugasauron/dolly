# Decisions for the owner from the audits of 1 and 2 November

- STATUS: OPEN
- PRIORITY: 400
- TAGS: owner,decisions

Every change the audits of 1 and 2 November found worth making but could not make alone: the
Dollyfile language, the process contract (`abi/`, `include/dolly/`), what a base image contains, a
browser's authority. One line each, with the evidence's place and a recommendation. The audit
tasks they came from are closed; their own work is merged on `integrate/2026-11-02`.

## Recommended yes

- **http@0's limits** (`proposal/http-limits`: a85477e3 body cap 8 to 64 MiB; f22cb90e the timeout
  bounds a wait, not a whole request). Three recorded Studio takes died on today's limits (two at
  the 600 s deadline while a long answer streamed, one at 8 MiB after reading its frames, which the
  SDK reports as "Connection error."). Its task is on the branch: `tasks/20261101-222946-http-limits`.
- **Terminal VMIN 0 and VTIME** (`fix/video-findings`: ab51b690, 588a5ebd, 8f3a9d49): POSIX
  non-blocking key reads in raw mode; without them a TUI set up as kilo sets it fails `tcsetattr`
  and exits at once (Opus's Rust garden in Studio). Adds two fields to the terminal mode word.
  Its task is on the branch: `tasks/20261102-023648-video-findings`.
- **The kernel copies no executable** (`core/firefox-process-memory` b59e558e8): a cold launch
  stops growing the kernel by the file's size; changes `abi/dolly-supervisor-0.wat`.
  Its task is on the branch (`tasks/20261102-042011-firefox-process-memory`).
- **Slop runs `test`, `[`, `echo`, `printf`, `true`, `false` itself** (`proposal/slop-utilities`):
  FFmpeg's configure spawns about 75,000 processes; with it 65 s, without it 344 to 439 s.
- **One Dollyfile parser, the page's** (`proposal/dollyfile-one-parser`): 372 lines out, 256 in.
- **Signal dispositions told to the kernel** (`tasks/20261101-074306-audit-kernel`): posix_spawn
  refuses every program that ignores a signal (0 of 80 cases against Linux's 80), and an ignored
  SIGCHLD cannot reap.
- **File mtimes in session saves** (audit-kernel): a restore gives every file the restore time, so
  make can call a stale target up to date.
- **A compiler round before the next release**: llvm-cc builds a compiler (e52b7eb5, in the root
  `.cache`) that differs from the pinned seed (3f99ed02), because the compiler links the libc adapter
  the night changed. Not a choice but a scheduled step: rebuild with the new seed and check the pin
  is a fixed point.

## Recommended later, or small

- The kernel side of streaming capture (`core/stream-capture` 5952d104, 3dbf32ba): changes
  `abi/dolly-image-0.wat`. The page side was reverted (see `tasks/20261101-221415-stream-capture`).
- An ABI digest that hashes only the process WAT and headers, not the supervisor side
  (`tasks/20261101-102515-retained-process-memory`).
- The spawn budget does not see what a threaded process allocates after its second thread starts
  (`tasks/20261030-090000-chrome-grown-memory`): the libc adapter reporting its break would; a
  process contract change.
- `libdolly-process.a` linked as an ordinary archive instead of `--whole-archive` (no recorded
  reason; the DSO provider exports need measuring first) (`tasks/20261101-074306-audit-kernel`).
- One leased-device contract (`proposal/leased-device`): no smaller; with the next device module.
- The image catalog as JSON instead of `.mjs`; prefetching packs during boot (audit-runtime).
- Small language and contract items: drop `EXPORTS ENV … APPEND` (`proposal/dollyfile-no-append`) and
  `REQUIRES FILE/ENV` (`proposal/dollyfile-requires`); remove `/bin/cd`; interactive Slop not moving to
  /workspace; mailbox values as contract constants (`proposal/host-mailbox-constants`); snapshot's
  session name off the mailbox (`proposal/snapshot-no-session-name`).
- `default` (and `system`) installing the `html` package, so a shell user has html@0 without
  `nena enable html` (`tasks/20261101-124237-html-popups`): a base-image change.
- The recipe language cannot leave build-only tools out of an image (Rust's 370 MB toolchain stays
  in an image that used cargo).
- `tar` restoring mtimes (a seed change): Emacs compiles a 12-line `utimensat` program to make the
  release's generated files current (`tasks/20261102-133232-recipes-apps`, S2); with the session
  saves' mtimes above, make sees the times upstream's archive gives.
- A fractional `sleep` in the core: ghostty-x11 and x11-desktop poll for the X socket with up to
  6000 `test` spawns, since sbase's `sleep` takes whole seconds (recipes-apps F4).
- SpiderMonkey builds as `-D__wasi__` on `wasm64-unknown-wasi`, a detection claim of the kind the
  porting rules forbid, because mozbuild knows no Dolly; a `dolly` OS in its tables is a source
  patch (recipes-apps F11).
- The terminal's palette (`src/ghostty/display.c`, a seed input) as a file the image holds or a
  `display@0` setting, so a page's look is complete: popups follow the page's CSS, the terminal
  does not (`tasks/20261102-133357-npm-agent-sandbox`).
- Publishing `@daugasauron/dolly-package-git`, `-python` and `-cc` (3.4, 51 and 35 MB), which
  `scripts/package-npm.mjs` packs and `dolly-build init` installs from (npm-agent-sandbox).
- raylib 6.0's software renderer (unchanged upstream) does nothing for blend modes, wraps additive
  colours, draws nothing for DrawPoly and reads the screen upside down: patch upstream or wait.

Done when each line is decided: merged, scheduled or declined.
