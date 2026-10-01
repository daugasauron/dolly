# Core polish: no workarounds

- STATUS: OPEN
- PRIORITY: 345
- TAGS: core,audit,cleanup

Owner direction (2026-10-01): no workarounds in the core; maximum polish. Audit
the kernel, process ABI and libc adapter, host modules, supervisor and page
shell, compiler driver and build scripts for special cases, compatibility
shims, duplicated mechanisms, test-only surface and stale comments, and remove
them.

## Done when

- Each finding is fixed or recorded with a reason it must stay; source,
  artifact and browser suites pass.

## Audit (2026-10-01, branch `work/core-polish`)

Six read-only sweeps (kernel and supervisor by hand; compiler driver, Slop,
libc adapter, host modules and build scripts delegated) over `src/`, `include/`,
`abi/`, `host/`, `scripts/`, `toolchain/` and the core recipes. Every claim
below was checked against the current source before acting; browser facts were
measured in headless Chrome 151 and Firefox 155.

### Fixed

Kernel, supervisor and page (no image rebuild):

- The kernel was linked as a program it never ran (`main`, `INVOKE_RUN=0`,
  `noInitialRun`, a derived `_main` export) and exported four globals nothing
  read; it is now linked with `--no-entry` and exports only `__stack_pointer`.
- The process Worker's table helpers tried a Number index before a BigInt one;
  both browsers take only BigInt for i64 tables, so the fallbacks were dead.
- An executable requiring a disabled host module was admitted and failed call
  by call; the supervisor now compares against enabled providers and refuses it
  before entry (`test/host-modules-browser.mjs` asserts 126).
- The kernel-plugin loader's hand copy of the contract's import list is
  generated from the WAT next to the digest.
- Dead surface deleted: `scripts/browser-startup.mjs`, the host-modules CLI
  `host` field, a re-exported alias, `DOLLY_FORCE_SNAPSHOT`, an object compiled
  into no archive, three npm aliases, the session marker file nothing read, the
  compression fallbacks no supported browser needs, the parser's start-section
  flag and its two assertions.
- The HTTP and download kernels defined client API names with external
  linkage; they are static, and the HTTP body bound is the generated constant.
- The one browser workaround that must stay (TextDecoder hidden while
  Emscripten's glue loads) records its measured reason in place.

Process ABI, libc adapter, compiler and recipes (every image rebuilds):

- Removed from the process API: `dolly_spawn_env` (no caller), `dolly_getrandom`
  (a copy of `getrandom`), `dolly_interrupt_checkpoint` (test-only, with a
  false "compiler-inserted" comment), `dolly_exit` (a masked exit), the unused
  `DOLLY_PROCESS_ABI_VERSION`. The Samurai patch called the checkpoint per
  string node and per path character; the supervisor's forced termination
  already ends a build that never enters the kernel, and its interrupted exit
  is `_exit(130)`.
- `exit(-1)` trapped the Worker (status 126) because `__wasi_proc_exit` passed
  an unmasked status the kernel rejects; it masks to 0..255 now.
- `usleep` rejected a second or more instead of sleeping; `mmap` refused an
  address hint and `MADV_DONTNEED` left pages unchanged; `open(O_NONBLOCK)`
  dropped the flag; `getservbyname` shadowed musl's working table; a serial-only
  `pthread_cleanup_push` override reached the threaded libc. Each fails or
  works explicitly now. (`sysctlbyname` keeps its explicit `ENOSYS`: Zig's C
  output references it, which a repository grep does not show.)
- Compiler driver: the `DOLLY_CC_TRACE` file and its boot-error reader, two
  Dolly-only no-op flags, the `-sMEMORY64=1` spelling, the
  `--allow-shlib-undefined` translation to a different policy, a per-job
  `-mllvm` option already set globally, the GOT skip and needed-library
  machinery that accepted plugins the loader refuses, the post-stamp
  re-validation that parsed every output twice, a hand-written custom-section
  writer, an always-true parameter and five history-narrating comments.
- The kernel plugin contract imports `fclose` directly (the `dolly_fclose`
  rename came from the first prototype) and offers `strlen`, `memcmp` and
  `bcmp`, so `modules/ghostty.dm` no longer carries a libc shim.
- `snapshot.h` is kernel-private and no longer published to programs; the
  image boot exports moved from the snapshot module's contract to the runtime's
  `abi/dolly-image-0.wat`, where their implementation lives; two seed files
  nothing read are gone.
- In-house recipes no longer pin strict `-std=c17` (the driver defaults to
  gnu17); feature-test macros inside sources stay, as ordinary portable C.
- Slop: `cd` without `HOME` and the `/bin/cd` command fell back to
  `/workspace` silently; `"${@}"` and `"x$@"` silently joined fields (the first
  expands like `"$@"`, the second is rejected); `$*` ignored `IFS`; a 38-line
  wildcard matcher mishandled `[[:class:]]` and is `fnmatch`; functions could
  not shadow regular builtins; the editor's key codes are named; a lost
  interrupt window at the prompt is closed; dead branches, an unread
  out-parameter and a TypeScript line in the core `help` are gone
  (`test/fixtures/slop-cases.mjs` adds five Bash-checked cases).
- The JS recipe graph accepted two modules of one name at different locations
  that the C engine rejects; both reject it (parity fixture).

### Left, with reasons

- Firefox double-dispatch workaround (`Reflect.apply` in
  `src/process-supervisor.mjs`): a measured engine bug (`511cd75`, Firefox 155).
- TextDecoder shadowing at boot: `-sSHARED_MEMORY=1` would make Emscripten's
  glue copy before decoding but selects the wasm-workers libc, which the kernel
  cannot link; the reason is recorded in place.
- The `cc` proxy's retry on 126: restored deliberately by the owner
  (`5221de8`). A supervisor-level `EAGAIN` before guest entry would be the
  proper home.
- `readlink("/proc/self/exe")`: a documented contract (`docs/process-model.md`)
  used by programs and tests.
- `window.__dolly` and the page's terminal-scraping helpers: 54 test files and
  18 launch points use them; isolating them needs a harness-side injection
  design (`20260930-100000-audit-24`). The terminal result mailbox stays with
  them.
- Pi's retention paths in `src/fs-record.h` and `src/dollyfile-view.mjs`: a
  recipe-level retention directive is the right replacement (Dollyfile v6).
- Hand-copied mailbox layouts for display, upload, snapshot and the terminal
  (`20260930-100000-audit-10`), the device-lease header duplicated across GPU
  and audio, the display kernel's font path, the always-set GPU feature bits,
  the HTTP clients' 10 ms polling, the upload page's 25 ms polling and the
  session save blocking the kernel thread: each is a contract change recorded
  in `20261001-000000-host-modules`.
- Emscripten's `libstubs` still answers `flock`, `getrusage`, `times`,
  `getloadavg`, `mprotect`, `getrlimit` and process groups with made-up
  successes. An honest `flock` (`ENOTSUP`) was tried and reverted: Zig's build
  cache locks every manifest, so `zig build-obj` failed to load `std.zig`
  (ghostty-build, 2026-10-01). A kernel lock table behind a process operation
  is the real fix; which other answers upstream programs tolerate needs
  deciding per API.
- Terminal `CANONICAL`/`ECHO` bits are stored but never applied and termios
  reports `ICRNL|IXON` it does not implement: a terminal-contract decision
  (`20260930-100000-audit-47`).
- `posix_spawn` always sends the parent's cwd as a path; writes are split into
  16 KiB packets without a measured reason.
- Slop: the builtin table in three places, two duplicated scanners (here-doc
  backticks keep their escape layer), PATH and spawn duplicated with
  `run-program.h` (`20260930-100000-audit-36`), the interactive `/workspace`
  and history-path literals.
- Build scripts: two snapshot packers and three metadata writers, the container
  defined twice in `build.sh`, hand-kept route and output lists, five
  fetch-and-extract scripts, static sources hashed three times per publish,
  undocumented `DOLLY_SNAPSHOT_IMAGE`/`DOLLY_BROWSER_PROFILE` plumbing, the
  image builder importing `test/browser-server.mjs` (`audit-52`, `audit-53`).
  None is runtime code; a build-scripts pass should take them together.
- `scripts/package-github-pages.mjs` names the three images too large for
  GitHub Pages; selecting by snapshot size needs the sizes at packaging time
  (`20260930-100000-audit-63`).
- `toolchain/build-toolchain.sh` duplicates (a sparse-checkout line, a native
  `llvm-nm` the container already ships): any edit changes the toolchain cache
  key and rebuilds LLVM for hours; batch with the next toolchain bump.
