# Decisions for the owner, 1 to 3 November

- STATUS: CLOSED
- PRIORITY: 400
- TAGS: owner,decisions

Every change the audits of 1 and 2 November found worth making but could not make alone: the
Dollyfile language, the process contract (`abi/`, `include/dolly/`), what a base image contains, a
browser's authority. One line each, with the evidence's place. The audit tasks they came from are
closed; their own work is merged on `integrate/2026-11-02`. Since 2026-11-03 the other tasks'
questions only the owner can answer were here too.

## Closed (2026-11-04)

Owner (2026-11-04): "That is a huge list 'pending' on me... to me there is no reason for me to
approve these things. Use a fable subagent to go through and answer all those questions. Make sure
the agent understands the intent of the project (small core, first principles, no workarounds).
After that these things should not be blocked and converted to normal tasks."

Done so the same day: every item below carries its decision, reasoned from AGENTS.md's intent and
the evidence its line names, and the ones taken are ordinary tasks (`tasks/20261104-0745*`). The
owner himself ruled on the four already settled (Python threads approved, the three image-size
proposals declined for now, the compiler round done, `boot({ session })` done) and on the three
steps bound by rules (publishing: with 0.1.5; the phone: paused; Claude Code's turn: on hold).
Nothing here waits for the owner.

Branches to delete, each once its task has taken what it names: `proposal/http-limits`,
`proposal/http-body-limit` (superseded by http-limits, which carries the same commit),
`proposal/slop-utilities`, `proposal/dollyfile-one-parser`, `proposal/dollyfile-no-append`,
`proposal/dollyfile-requires`, `proposal/leased-device`, `proposal/host-mailbox-constants`,
`proposal/snapshot-no-session-name`, `fix/video-findings`, `core/firefox-process-memory` (its one
commit cherry-picked), `core/stream-capture` (its two proposal commits re-applied; the rest is on
integrate through `core/stream-capture-2`). `proposal/image-size-dwarf` stays as
`tasks/20261103-102041-imgsize` records it.

## Recommended yes

- **http@0's limits** (`proposal/http-limits`: a85477e3 body cap 8 to 64 MiB; f22cb90e the timeout
  bounds a wait, not a whole request). Three recorded Studio takes died on today's limits (two at
  the 600 s deadline while a long answer streamed, one at 8 MiB after reading its frames, which the
  SDK reports as "Connection error."). Its task is on the branch: `tasks/20261101-222946-http-limits`.
  **Yes**, both: a local limit below the remote one turns a refusal the program can act on into one
  it cannot; the slot pool is what a limit protects and it is held while waiting. No authority
  changes. `tasks/20261104-074501-http-merge`.
- **Terminal VMIN 0 and VTIME** (`fix/video-findings`: ab51b690, 588a5ebd, 8f3a9d49): POSIX
  non-blocking key reads in raw mode; without them a TUI set up as kilo sets it fails `tcsetattr`
  and exits at once (Opus's Rust garden in Studio). Adds two fields to the terminal mode word.
  Its task is on the branch: `tasks/20261102-023648-video-findings`.
  **Yes**: POSIX's discipline, measured on rebuilt images. `tasks/20261104-074502-terminal-mode`.
- **The kernel copies no executable** (`core/firefox-process-memory` b59e558e8): a cold launch
  stops growing the kernel by the file's size; changes `abi/dolly-supervisor-0.wat`.
  Its task is on the branch (`tasks/20261102-042011-firefox-process-memory`).
  **Yes**, by cherry-pick: the branch also carries the reverted first form of `core/process-memory`.
  `tasks/20261104-074503-kernel-copies`.
- **Slop runs `test`, `[`, `echo`, `printf`, `true`, `false` itself** (`proposal/slop-utilities`):
  FFmpeg's configure spawns about 75,000 processes; with it 65 s, without it 344 to 439 s.
  **Yes**, with `printf`: every POSIX shell does it, and the builtin shares the program's source.
  `tasks/20261104-074504-slop-language`.
- **One Dollyfile parser, the page's** (`proposal/dollyfile-one-parser`): 372 lines out, 256 in.
  **Yes**: two parsers kept equal by parity tests; the engine's checks run in userspace assumed
  compromised and protect nothing. `tasks/20261104-074504-slop-language`.
- **Signal dispositions told to the kernel** (`tasks/20261101-074306-audit-kernel`): posix_spawn
  refuses every program that ignores a signal (0 of 80 cases against Linux's 80), and an ignored
  SIGCHLD cannot reap. **Yes**: the kernel owns signals and is the one decider; a rule held in two
  places drifts. `tasks/20261104-074505-process-signals`.
- **File mtimes in session saves** (audit-kernel): a restore gives every file the restore time, so
  make can call a stale target up to date. **Yes**: a wrong build after a reload is a defect; 8 bytes
  a record, a version step. `tasks/20261104-074507-session-mtimes`.
- **A compiler round before the next release**: done; the Python-threads work pinned the new seed
  compiler (`llvm-cc` aa17d632).
- **`ICRNL` in the kernel's initial terminal mode** (`src/dolly.c:21`), the POSIX default (`stty
  sane`): a program that leaves `c_iflag` alone, as Neatvi does, reads Enter as CR in raw mode, so
  the vi package wraps `read` (without the wrapper, `one^Mtwo` on one line, measured). One kernel
  line, then the wrapper goes (`tasks/20261102-133210-recipes-core`, P1).
  **Yes**: the fix is the initial mode, not the recipe. `tasks/20261104-074502-terminal-mode`.

## Recommended later, or small

- The kernel side of streaming capture (`core/stream-capture` 5952d104, 3dbf32ba): changes
  `abi/dolly-image-0.wat`. The page side is the image store since `core/stream-capture-2`
  (`tasks/20261101-221415-stream-capture`). **Yes**, re-applied onto the image store, in the same
  round as the executable copy: the kernel's copy is the build's high-water mark for nothing
  (3.0 to 0.7 times the image, measured). `tasks/20261104-074503-kernel-copies`.
- An ABI digest that hashes only the process WAT and headers, not the supervisor side
  (`tasks/20261101-102515-retained-process-memory`). **Yes**: an executable links the process WAT
  and headers alone; the supervisor contract ships with the runtime. `tasks/20261104-074509-process-archive`.
- The spawn budget does not see what a threaded process allocates after its second thread starts
  (`tasks/20261030-090000-chrome-grown-memory`): the libc adapter reporting its break would; a
  process contract change. **Measure first**: no failure from it is recorded; `lake build -j4` and
  `cargo build -j4` in a 6 GB slot decide it. `tasks/20261104-074510-spawn-budget`.
- `libdolly-process.a` linked as an ordinary archive instead of `--whole-archive` (no recorded
  reason; the DSO provider exports need measuring first) (`tasks/20261101-074306-audit-kernel`).
  **Yes if the measurement holds**: the whole archive is what made `abort` collide and the weak
  attribute a workaround. `tasks/20261104-074509-process-archive`.
- One leased-device contract (`proposal/leased-device`): no smaller; with the next device module.
  **Yes, now**: one protocol written eight times is slop; rounds happen, and rebuild cost is not a
  reason to defer getting the core right. `tasks/20261104-074508-host-contracts`.
- The image catalog as JSON instead of `.mjs`; prefetching packs during boot (audit-runtime).
  **Yes** to JSON (data as data; the release verifier's parser of JSON-in-JavaScript goes; with a
  version, since the npm packages' layout changes). **No** to prefetching: performance machinery
  against serial semantics for seconds of a first boot; the repeated downloads are
  `tasks/20261103-111707-cache`'s. `tasks/20261104-074513-catalog-json`.
- Small language and contract items: drop `EXPORTS ENV … APPEND` (`proposal/dollyfile-no-append`,
  **yes**: two uses against the catalog's rule, an ambiguous keyword) and `REQUIRES FILE/ENV`
  (`proposal/dollyfile-requires`, **yes**: never written); remove `/bin/cd` (**yes**: a program cannot
  do what `cd` means); interactive Slop not moving to /workspace (**yes, differently**: the shell
  starts where it is launched and the boot starts the session in `/workspace`, so the 28 bare-slop
  images keep their start); all four `tasks/20261104-074504-slop-language`. Mailbox values as
  contract constants (`proposal/host-mailbox-constants`, **yes**: the canonical contract is the WAT;
  40 values typed twice today) and snapshot's session name off the mailbox
  (`proposal/snapshot-no-session-name`, **yes**: the kernel never used it; 83 lines out):
  `tasks/20261104-074508-host-contracts`.
- `default` (and `system`) installing the `html` package, so a shell user has html@0 without
  `nena enable html` (`tasks/20261101-124237-html-popups`): a base-image change. **Yes**: `default`
  already declares what amy's packages may need; the popup grants nothing.
  `tasks/20261104-074511-base-html`.
- The recipe language cannot leave build-only tools out of an image (Rust's 370 MB toolchain stays
  in an image that used cargo). **No**: the language already can. `USE` installs what only a build
  needs without recording it, and a `PACKAGE` retains only what it exports (ripgrep's is 5.9 MB);
  an application built `FROM` a toolchain keeps the toolchain because `FROM` means that. Where an
  image is large for this reason the recipe is restructured (build as a package, install it into an
  image `FROM system`), which is recipe work, not a language change.
- `tar` restoring mtimes (a seed change): Emacs compiles a 12-line `utimensat` program to make the
  release's generated files current (`tasks/20261102-133232-recipes-apps`, S2); with the session
  saves' mtimes above, make sees the times upstream's archive gives. **Yes**: every tar does; the
  helper goes. `tasks/20261104-074506-seed-commands`.
- A fractional `sleep` in the core: ghostty-x11 and x11-desktop poll for the X socket with up to
  6000 `test` spawns, since sbase's `sleep` takes whole seconds (recipes-apps F4). **Yes**: a
  `sleep` of the core taking a decimal, posix stops exporting sbase's. `tasks/20261104-074506-seed-commands`.
- SpiderMonkey builds as `-D__wasi__` on `wasm64-unknown-wasi`, a detection claim of the kind the
  porting rules forbid, because mozbuild knows no Dolly; a `dolly` OS in its tables is a source
  patch (recipes-apps F11). **Yes, measured first**: list what `__wasi__` selects, then the `dolly`
  OS in mozbuild's tables as the demo's patch; the target's name is the claim, so the entry is made
  even if every selected branch proves true for Dolly. `tasks/20261104-074514-spidermonkey-target`.
- The terminal's palette (`src/ghostty/display.c`, a seed input) as a file the image holds or a
  `display@0` setting, so a page's look is complete: popups follow the page's CSS, the terminal
  does not (`tasks/20261102-133357-npm-agent-sandbox`). **Yes, as the page's setting**, not a file:
  the owner's rule for the popups is that the look is the page's and not the program side's; one
  source for terminal and popup. `tasks/20261104-074512-terminal-palette`.
- Publishing `@daugasauron/dolly-package-git`, `-python` and `-cc` (3.4, 51 and 35 MB), which
  `scripts/package-npm.mjs` packs and `dolly-build init` installs from (npm-agent-sandbox).
  Owner (2026-11-04): "leave it until next version, 0.1.5." His step at that release:
  `tasks/20261104-074515-npm-publish`.
- `tcgetpgrp` for the terminal descriptor in the libc adapter (a process-contract change): dte's one
  changed line exists because the adapter has none (recipes-core P3). **Yes**: the kernel knows the
  foreground process and every process is its own group, so the answer is true; dte builds
  unchanged. `tasks/20261104-074505-process-signals`.
- raylib 6.0's software renderer (unchanged upstream) does nothing for blend modes, wraps additive
  colours, draws nothing for DrawPoly and reads the screen upside down: patch upstream or wait.
  **No**: no catalog program hits the four (bhop blends itself, Slopyard draws through gpu@0;
  only Studio's recordings did), and a per-program patch of upstream's renderer is what the porting
  rules prefer to avoid; re-check at raylib's next pin. No report upstream.

## Added 2026-11-03

- **Buttons in `touch@0`** (835fa963b, approved by you on 2026-11-03): BUTTONS (op 95) shows the
  touch lease holder's labels in input@0's bar below the canvas, beside Paste; a tap is a `PRESS`
  record. It contradicts the done-when you set on 2026-10-13 ("the module knows nothing of
  buttons, captions or any program") and resembles the `buttons@0` you disliked in October: keep
  buttons in `touch@0` as approved today, or give them a module of their own
  (`tasks/20261013-144001-touch-module`). **Keep them in `touch@0`**: only the page may read the
  clipboard, so every button beside Paste is the page's, drawn by one renderer; a press is a tap
  that belongs to whoever holds the fingers, so the contract is the touch lease's (labels in,
  presses out); a module of its own would add a lease and a foreground rule for the same two
  messages. The contract is generic, which is what the October sentence guarded. The touch-module
  task's State says so.
- **The phone**: pi-phone ran on your phone on 2026-11-03 over USB; `fingers` with two real
  fingers and the phone keyboard's own paste (whether Paste can leave input@0) were not tried.
  Owner (2026-11-04): "the last test was okay so just pause that." **Paused**; recorded in
  `tasks/20261013-144001-touch-module`, which waits for nobody.
- **Claude Code's real turn** (folded from `tasks/20261012-232215-owner-answers`): on 2026-10-23
  Claude Code's first request with the key in `~/.claude-api` drew "Credit balance too low"; on
  2026-11-03 the same key answered Pi's turns on your phone ($0.023 and $0.022), so its
  organization now has balance. Owner (2026-11-04): "API code turns, on hold for now." **On hold**;
  no task.
- **`boot({ session: NAME })`** (`tasks/20261102-133357-npm-agent-sandbox`): done and merged
  (`tasks/20261103-111722-npmsession`).
- **Image size: three proposals** (`tasks/20261103-102041-imgsize`, measured on
  `audit/image-size`, which cut the terminal's font to 0.9 MB losslessly). Strip the C runtime
  libraries' debug information (`proposal/image-size-dwarf`, 27eeb83f6): `system` and `cc` each
  13.4 MB smaller, 4.84 MB less to download (-11% and -14%); a debugger loses libc's and libc++'s
  source lines. Droid Sans Fallback (CJK) as a package `system-tools` installs: `default` 1.66 MB
  less gzip, its CJK cells boxes until the package is installed and the terminal restarted. Python's
  `libpython3.14.a` split from `python` (13.1 MB, 4.5 MB gzip, 28% of the package), as Debian's -dev.
  Owner (2026-11-04): "I think these sounds too complex and would cause issue. Lets leave it for
  now." Declined for now; the branches stay unmerged.

## Added 2026-11-04 (the night of 3 to 4 November)

- **Python threads: the compiler round and dso@0's growth** (`tasks/20261103-134653-pythreads`,
  merged into `integrate/2026-11-03`, in the night round): libraries and FFI closures now reach
  every thread of a host using threads@0, which needed a new seed compiler (`llvm-cc`
  aa17d632…, pinned), the libc adapter's futex wait through the loader, and three additions to
  the dso@0 contract (`DOLLY_DSO_WAIT`, the 272-byte `__dolly_dso_threads` a host exports,
  libraries exporting their TLS initialiser). A thread's start with 61 libraries loaded takes
  125 ms in Chromium and 250 ms in Firefox (about 20 ms before).
  Owner (2026-11-04): "Focus on getting everything merged, including python threads etc. and
  reconciling everything to a stable version on main." Approved: to `main` with the next green round.
- **The runtime's own files are not in the pack store** (`tasks/20261103-111707-cache`): 3 MiB
  of small files the HTTP cache keeps; storing them too needs a service worker. Packs are stored.
  **No**: 3 MiB against an image's hundreds, kept by the HTTP cache anyway; a service worker is a
  new trusted component for the boundary review. The cache task's done-when ("fetch nothing
  large") stands; measure a start on the phone's network after it lands before adding one.
- **Rust: let the images' programs unwind too** (`tasks/20261009-110500-rust-followups`): one
  line, programs 17–35% larger, no speed change measured; today only users' crates unwind.
  **No**: the cost is measured (codex at 199 MB would grow by a quarter), the gain is not; a panic
  prints its message under abort too. Reopen when a catalog program misbehaves under
  `panic=abort`.
- **The display at `-Oz`**: `libdisplay.so` 19.4% smaller, speed not measured, rebuilds every
  image. **No**: 0.36 MB for an unmeasured risk to the terminal's drawing speed.
- **`cc` passes `-Wp,ARG` to the preprocessor** (`tasks/20261103-102041-zig017`): Zig would find
  libc itself and the zig package's `libc.txt` could go; a seed change. **Yes**: a hand-written
  `libc.txt` is a workaround the driver's missing option caused. `tasks/20261104-074506-seed-commands`.
