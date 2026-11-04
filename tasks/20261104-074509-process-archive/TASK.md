# libdolly-process.a linked as an archive; a module's digest covers what its executables link

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,libc,abi,build,investigation

Two findings about how an executable is linked and identified. Decided 2026-11-04
(`tasks/20261102-133353-owner-decisions`): yes to the digest; yes to the archive if its measurement
holds. Both are toolchain and seed changes: one round.

**The whole archive.** `libdolly-process.a` is linked `--whole-archive` since the first checkpoint
b95459ce, no reason recorded (`src/compiler.cpp:907`, `scripts/build.sh`'s `build_process` and
`build_process_cxx`, `demos/rust/toolchain/link.sh`). What it does: the adapter's definitions
(`raise`, `sigaction`, `getpid`, …) go in whether referenced or not and so beat Emscripten's libc
members of the same names; it also makes every such name collide with a program's own, and `abort`
was the first (zero-ad-engine's link of `spidermonkey-check` failed), fixed by
`__attribute__((__weak__))` on `abort` (36367ba3): a workaround. The probe of
`tasks/20261101-074306-audit-kernel` (`wasm-ld --trace-symbol=abort` on `build_process`'s line)
shows an ordinarily linked archive before `-lc-ww` wins by order too; the whole archive may only
be covering unreferenced definitions, such as the ones a DSO host exports (`--export-if-defined`).
Measure first, in the seed toolchain: the symbols linked from each member of the archive and the
export list of a program that hosts shared libraries, a `-pthread` program and a Rust program,
with and without `--whole-archive`. If they are equal, or the differences are definitions a
`--undefined` or `--export-if-defined` names, the flag goes in the three places and the weak
attribute with it.

**The digest.** `DOLLY_NAME_ABI_DIGEST`, which every executable linking a module records and the
loader checks, is the SHA-256 of the module's `contracts` (the kernel-to-runtime WAT, such as
`dolly-threads-supervisor-0.wat`), its process WAT and its headers
(`scripts/generate-abi-constants.mjs:50`). An executable compiles against the process WAT and the
headers alone; the supervisor contract is internal to the runtime and the kernel, which ship
together. Hashing it makes a comment's edit refuse every threaded and every pty program in the
catalog (what stopped the first shape of `tasks/20261101-102515-retained-process-memory`'s fix).
Hash `files("process")` and the headers. The threads and pty digests change once.

Done when: the measurement's table is in this task and `--whole-archive` and the weak `abort` are
gone, or the table says which definition needs them; the digest covers the process WAT and headers,
and an edit to a supervisor WAT's comment leaves `npm run build:runtime`'s image inputs unchanged
(measured); process, threads, dso, stack, pty and rust suites pass in Chromium and Firefox on the
round's images, `process-browser`'s own-`abort` case among them.

## The digest (2026-11-04, `core/process-archive`)

`scripts/generate-abi-constants.mjs` hashes what an executable compiles against: the bytes of the
module's process WAT and hand-written headers, and the constants its kernel-boundary contracts give
`NAME-abi.h`. Not the contracts' bytes: for thirteen modules (http, display, audio, …) the contract is
their only WAT and the source of the constants their clients compile with, so `files("process")` and
the headers alone would have dropped those constants from identity; their comments and types are
between the kernel and the host, which ship together.

- Measured with `npm run build:runtime`: image inputs `62485550…` before and after a comment edit in
  `dolly-threads-supervisor-0.wat` and `dolly-http-0.wat`. The old generator on the same edit:
  threads `fcbd4fc0…` → `734e387a…`, http `55184f83…` → `db0f6033…`; the new one keeps both. A changed
  constant (`DOLLY_HTTP_SLOT_COUNT`) still changes http's digest.
- Every module with a kernel-boundary contract changes its digest once (the thirteen and pty and
  threads); dso, sockets and stack, which have none, keep theirs. The headers' recipe pins
  (`system-build`, the `libdolly-*` packages, `html`) are replaced by hand, the references repinned.

## The whole archive (2026-11-04, `core/process-archive`)

History: `git log -S whole-archive` gives b95459ce (2026-09-05, the first checkpoint) for
`compiler.cpp` and `build.sh`, and 5f973f0b (2026-09-09, the Rust seed) for `link.sh`, each with
no reason recorded. 3213f8ae's probe (`tasks/20261101-074306-audit-kernel`) and 36367ba3's weak
`abort` are what followed.

**Measured** in the seed container, whose `wasm-ld` is LLD 24.0.0 at `4bfd08c2`, the seed
compiler's `DOLLY_LLVM_COMMIT`: each program linked on its own line with and without
`--whole-archive`, compared by `--Map` (every definition with the member it came from and its
size) and the export section; `--why-extract` says what fetched each member. The lines:
`compiler.cpp`'s `link_process_executable` (serial, `-pthread`, `-rdynamic` with the provider list),
`build.sh`'s `build_process` (emcc), and `link.sh`'s for `rustc`, on a copy of the root checkout's
`build/rustc-port/package/rust-link`. Objects from the core's test programs, compiled by the
container's emcc with the driver's defines; Cargo's object from the Rust seed (`rust-sdk.tar.gz`)
with the `rust-sdk` image's libcurl and zlib, as `Dollyfile-rust-sdk` links it.

| program | line | definitions, exports (whole = normal) | `libdolly-process.a` members |
|---|---|---|---|
| `calls-abort`, own `abort` in an archive | serial | 87, 4 | same 6 |
| `object-abort`, own `abort` in an object, `signal()` | serial | 89, 4 | same 6 |
| `dso-check`, `dso-cpp-check` | `-rdynamic` | 6,937, 5,275 | same 11 |
| `process-signals.c` (dso suite) | `-rdynamic` | 6,961, 5,275 | same 11 |
| `threads-pthread.c`, `threads-cpp.cpp` | `-pthread` | 421, 5 / 472, 5 | same 7 / 5 |
| `dso-threads.c` | `-pthread -rdynamic` | 7,064, 5,278 | same 7 |
| Cargo (Rust) | `-pthread` | 85,111, 6 | same 7 |
| `check.c`, `cpp-check.cpp`, `bootstrap.c` | `build_process` | 135 / 1,672 / 163, 4 | same |
| `rustc` (Rust, provider list) | `link.sh` | 390,426, 5,269 | same 11 |
| **`protect-only`**: `sync`, `getgroups`, `madvise`, `mprotect`, no `mmap` | serial | 98 whole, **94** normal | `mmap.o` only whole |

Only the member order differs in the equal rows (so do the bytes). The last row is the one the
whole archive covered: linked normally, `libstubs.a(emscripten_syscall_stubs.o)`, fetched for
`__syscall_sync`/`__syscall_getgroups32`, defined its weak `__syscall_madvise` and
`__syscall_mprotect` (5 bytes each, success) while `mmap.o`'s were still lazy, so `mprotect` said
"let's not and say we did". Every other overlap cannot differ (from `llvm-nm` of every archive on
the line): a one-name libc member is only fetched for that name and the adapter's lazy one comes
first; `lock_ptc.o`, `__lock.o`, `emscripten_mmap.o`, `default_attr.o` define only adapter names and
are never fetched; `libc-adapter.o`, `signal.o` (crt1's `__dolly_signal_start`), `poll.o` and the
pthread stubs are fetched before any library is read; `threads.o` is fetched by
`--export=dolly_thread_start` in every `-pthread` link and its strong names replace libc-mt's weak
`__tl_lock`, `__do_cleanup_push`; a DSO host's provider list names `mmap`, `nanosleep`, so `mmap.o`
and `time.o` are fetched there. `time.o`'s `clock_nanosleep` against libc's weak one in
`clock_nanosleep.o`, fetched for `__clock_nanosleep`, could differ only as a static libc does (no
libc, libc++ or dlmalloc member names `clock_nanosleep`); `time.o` now defines `__clock_nanosleep`
too (below), so that member is never fetched.

So the cause is the stub member, not the archive: `prepare-process-sysroot.sh` leaves
`emscripten_syscall_stubs.o` out as it does `emscripten_libc_stubs.o`, and `libc-stubs.c` defines
the twelve names nothing else answers (`sync`, `getgroups32`, `getresuid32`, `getresgid32`,
`mlock`, `munlock`, `mlockall`, `munlockall`, `mremap`, `acct`, `mincore`, `setdomainname`) with the
answers `tasks/20261023-220000-getrusage` decided, and `getgroups(0, NULL)` counts the one group
(the stub refused it with `EINVAL`). `uname`, `getrusage` and `socketpair` are unreachable: the
adapter's own shadow the first two, nothing names the third. `abort` is a member of its own in both
archives (`abort.c`, 129d9fe1's shape, now in `build-process-threads.sh` too), strong.

Measured again on that sysroot (`1b8e548a…`): every row equal, `protect-only` too (98, `mmap.o`'s
`mprotect` both ways); `calls-abort` and `object-abort` link the program's own `abort` normally
and fail whole with `duplicate symbol: abort`, which is why the weak attribute goes with the flag.
DSO hosts lose five incidental exports, `emscripten_stack_*`, which the stub member's `prlimit64`
pulled in and `--export-dynamic` exported; the provider list leaves Emscripten's own API out.

Found on the way: C11 `thrd_sleep` (libc-mt only) did not link: it calls libc's
`__clock_nanosleep`, which needs `emscripten_thread_sleep`, and `build-process-threads.sh` removes
`library_pthread.o` (`undefined symbol: emscripten_thread_sleep`, measured). `time.c` defines
`__clock_nanosleep`, musl's own name for `clock_nanosleep`, so `thrd_sleep` sleeps on Dolly's clock;
`threads-pthread.c` sleeps by it. Measured again on that sysroot (`c2febe78…`): every row equal, the
`-pthread` program 423 definitions both ways.

## Verified (2026-11-04)

- Seed of `c8bc358c` (the flag gone, `abort` its own weak member, the stub member left out, the new
  digests; image inputs `e3d18f2f…`), `default`, `system`, `stack-wrap` and `libdolly-gpu` rebuilt
  (1,087 s): `process` (the own-`abort` case and the new `protects` program), `threads`, `dso`,
  `stack`, `pty` and `core` pass in Chromium and Firefox. The pinned compiler still links
  `libdolly-process.a` whole; `build.sh`'s `bootstrap` and probes are linked as an archive.
- Seed of the strong `abort` (sysroot `1b8e548a…`, the one measured above; image inputs
  `fd2cf6e9…`): the same four images build under the pinned compiler (937 s); `threads` passes in
  Chromium and Firefox; `process` fails at the own-`abort` case alone, `wasm-ld: error: duplicate
  symbol: abort`, which is the whole archive's doing and what the container measured.
- Seed of `__clock_nanosleep` (sysroot `c2febe78…`, image inputs `badb9a41…`), the branch's last:
  the four images rebuilt (944 s); `threads` (`thrd_sleep`), `dso`, `stack`, `pty` and `core` pass
  in Chromium and Firefox; `process` passes in both with its own-`abort` case left out of one local
  run, and fails at that case alone as above.
- The seed compiler's line without the flag: in the seed container (above), not in a browser. A
  browser needs the `llvm-cc` this round builds.
- Not run: the rust suite (it needs the Rust chain, a `hugebuild`): the round's step.

## The round

- `src/compiler.cpp` changed (`llvm-cc`'s pinned source): build `llvm-cc` with the current seed
  and pin it before any image that defines `abort` (`zero-ad-engine`'s `spidermonkey-check`) and
  before `process-browser`, whose own-`abort` case fails under a compiler that links the archive
  whole (`duplicate symbol: abort`). The images `llvm-cc` is built from define none (the
  2026-11-02 round, strong `abort` under the whole archive, failed `zero-ad-engine` alone).
- The seed (adapter, sysroot, every kernel-boundary module's digest): every image.
- `demos/rust/toolchain/link.sh` runs only when the Rust seed is rebuilt; `rustc` linked both ways
  is equal (above).

## Lessons

- Fourteen sampled programs linked the same with and without the flag; the one that did not was
  found by listing, with `llvm-nm`, every name the adapter defines that a later archive member also
  defines, and then writing the program for it. A link-model change is checked by its overlaps,
  not by the programs at hand.
- A closed task's reason ("every one of its definitions is weak, so an adapter definition replaces
  it", getrusage) held only under a link flag no one had written down. A reason that depends on
  how something is linked should name the link line.
- The seed container's `wasm-ld` is the seed compiler's own LLVM commit: a question about what the
  in-Dolly compiler links is answered there in seconds, maps and `--why-extract` included, without
  a compiler round.
- "Hash the process WAT and the headers" would have dropped from the digest the constants that
  http, display and the other device modules' programs compile with: the generated header is
  built from the contract it was meant to leave out. Read what the manifest fields mean
  (`host/README.md`) before taking a one-line instruction literally.
- The image builder repins the working tree when it starts: after a build, `git status` shows the
  base's stale pins (here six staged sources), which belong in a commit of their own.
