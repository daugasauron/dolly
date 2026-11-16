# The compiler's front-end helper is in the process runtime every program links, and its header is runtime@0's

- STATUS: OPEN
- PRIORITY: 70
- TAGS: audit,core,architecture,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, source of `b09b1e243`).

## State (2026-11-16)

Found by reading; nothing changed. It changes the seed (the process runtime), so it goes in a
seed or compiler round.

## Found

AGENTS.md, "Interface layers": the platform substrate (2) and the "libc, C++, language runtimes,
shells, and tools" above it (3) are kept distinct.

- `dolly_toolchain_proxy` (`process/runtime-adapter.c:213-249`) is the front end of `cc`, `c++`,
  `ld` and `ar` (`programs/commands/cc.c:16` and the three beside it): it spawns
  `/usr/libexec/dolly/process-bin/compiler` with `--dolly-toolchain-mode=...` and retries a 126
  twice. It lives in the runtime adapter, the runtime@0 client every executable links
  (`host/runtime/module.json`, `client`), so the process substrate names the compiler's path and
  its options.
- `include/dolly/toolchain.h`, which says of itself "internal to
  /usr/libexec/dolly/process-bin/compiler; it is not a kernel service or ABI entry", is one of
  runtime@0's `headers` (`host/runtime/module.json`), sourced and exported by
  `Dollyfile-system-build:9,18` (`EXPORTS HEADER toolchain`) into the SDK programs compile
  against.

The retry itself was restored by the owner on purpose (`tasks/20261001-214000-core-polish`) and is
not in question here; only where it lives.

## Do

Move `dolly_toolchain_proxy` to `programs/` (an object the four front ends link, as
`compiler-main.c` is the compiler's) and `toolchain.h` with it, out of runtime@0's `headers`;
`system-build` sources it from there for the front ends and stops exporting it.

## Done when

`grep -n toolchain process/ host/runtime/module.json` finds nothing; `cc`, `c++`, `ld` and `ar`
behave as before (the cpp and process suites in Chromium and Firefox) on the rebuilt seed.
