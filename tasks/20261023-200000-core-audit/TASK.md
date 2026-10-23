# Audit of the core after the 0.1.4 work: small and well thought out

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: core,audit,architecture,0.1.4

Owner (2026-10-23): "go ahead and audit stuff its very important to keep the core small and
well thought out", after "llvm should always be useful?" on the seed compiler's report that
the `llvm` package now duplicates `cc` and that the recipes building the core's compiler live
in `demos/`.

What changed today and is audited: the host registry from the embedding and device modules
that import only their own files (`main`); `boot()`, images under their own base and the npm
packages (`main`); `touch@0` replacing `buttons@0` (`core/touch-module`); the seed taking the
compiler built in Dolly (`core/seed-compiler`); the environment audit's fixes
(`core/audit-fixes`, in progress); the Janis installer (`demo/janis-install`).

Done when: the findings are in `audit.md` here, each fixed before the 0.1.4 round where the
fix is clear, or one line for the owner where it is a decision.

## Progress

- 3, 4, 5, 7, 8, 9, 10, 12 (the image directory line, `terminal-text.mjs`): fixed in 96b61bed,
  verified in Chromium and Firefox (commit message lists the suites). Found on the way: the
  custom session suite failed in today's Chromium writing a 151 MB legacy ArrayBuffer record
  into IndexedDB; that record format can no longer be read (its key's image build ID is gone),
  so the fallback and its test step went.
- 1, 2, 6, 11 (the wake loop): done at the merges, in the audit's order (`a588d3d4`,
  `3c5b78b0`, `b0f65b9c`, `842b78ed`): input@0's Paste styles itself, `serviceOnNotify` in
  the runtime, AGENTS.md's seed sentence, sbase's `which` kept with `command -v` in the
  guidance. Version 0.1.4 in `2ee36c90`; the catalog round started 18:09 on that commit and
  verifies them in a browser.
- Owner's three lines, decided by the integrator (2026-10-23 evening), done on
  `core/runtime-cleanup` (`work/runtime`):
  1. **`llvm` is LLVM itself.** `llvm-build`, after it keeps the compiler's archives as before,
     configures the same tree again for that alone (install prefix `/usr/lib/llvm`, tools linked
     `-Wl,--strip-all` as the compiler is, no shared libraries) and builds every LLVM library,
     the headers, `llvm-config` and 16 tools (`llvm-ar`, `-nm`, `-objdump`, `-readobj`,
     `-objcopy`, `-size`, `-strings`, `-symbolizer`, `-dwarfdump`, `-cxxfilt`, `-mc`, `-as`,
     `-dis`, `-link`, `opt`, `llc`, and the `ranlib`, `readelf`, `strip`, `addr2line` links).
     The package is `FROM llvm-build` with only its exports, links in `/usr/bin`, and
     `REQUIRES HOST dso@0`: `opt` and `llc` link `-rdynamic` for pass plugins.
     `/usr/bin/llvm-config` is a launcher that runs it in its own directory: LLVM asks
     `dladdr` for its own path, the libc's `dladdr` knows no file, and llvm-config then takes
     its working directory for its directory (Zig's recipe met the same, `demos/zig`). A
     `dladdr` that names the executable for its own addresses would make it unneeded; that is a
     libc change for the process workstream, not done here.
     Cost, measured (Chrome, `bigbuild`, machine shared with other builds): `llvm-build` 50 min
     for the compiler's part as before (make 2,999 s), then 12 min more (configure 24 s, the
     libraries 315 s, tools and install 354 s); its snapshot 949 MB (was 594 MB). `llvm-cc` is
     now `FROM llvm-tablegen` and copies `/usr/lib/llvm-build` alone, so it stays 612 MB and its
     compiler is the same bytes either way (`81a3cdf2…`, built both ways). The package: 322 MiB, 92 MB of packs (was 127 MB, a copy
     of `cc`'s compiler); `opt` and `llc` are 48 MiB each.
     The compiler is untouched: every one of the 604 files `llvm-build` keeps under
     `/usr/lib/llvm-build` (the 103 archives the compiler links, Clang's resource headers, the
     generated headers) is the bytes `work/x11fix`'s `llvm-build` holds, and `check.slop` in
     `llvm-cc` passed. The compiler `llvm-cc` linked differs from the seed's `9c747cff…` by 105
     bytes for another reason: the libc it links changed after the fixed point
     (`03717431`, `getrusage` and `times`), a seed change that `tasks/20261023-121443-exec-seed`
     re-pins in the round anyway; the path it takes (`llvm-cc`, then
     `demos/llvm/pin-seed-compiler.mjs`) reads only `llvm-cc` and `/usr/lib/llvm-build`.
  2. **The compiler's recipes stay in `demos/llvm`**: the bootstrap exception, in `AGENTS.md`'s
     bootstrapping section (and the core rule beside it) and `docs/sources.md` (`88407c1c`).
  3. **The site's code left `@daugasauron/dolly`**: see `tasks/20261023-113537-npm-packages`.

## Closed (2026-10-24)

Every finding of `audit.md` is fixed or decided: 1 to 12 at the merges and in `96b61bed`, the
owner's three lines in `88407c1c` (the bootstrap exception), `ade2f49a` (the site's code out of
the runtime package, `tasks/20261023-113537-npm-packages`) and `75e8de84` (`llvm` is LLVM
itself), each verified in Chromium and Firefox as its commit says. What item 11 left, whether
Gboard's paste reaches the terminal on a phone, is in `tasks/20261013-144001-touch-module`.

