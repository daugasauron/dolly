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
