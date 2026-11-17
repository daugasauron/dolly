# The compiler's front-end helper is in the process runtime every program links, and its header is runtime@0's

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: audit,core,architecture,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, source of `b09b1e243`).

## State (2026-11-17)

Fixed on `ws/seed` (`67dc59aae`, pins `5cb1dbdb5`; a seed change: it rebuilds every image; `system-build`'s recipe and
`llvm-cc`'s change with it). `dolly_toolchain_proxy` is `programs/commands/toolchain.c` and its
header `programs/commands/toolchain.h`, beside the four front ends; `Dollyfile-system-build`
sources both and links the proxy into `cc`, `c++`, `ld` and `ar`, and exports no
`HEADER toolchain`; runtime@0 names no toolchain header. The compiler's own sources include it
as `commands/toolchain.h`, which `llvm-cc` sources beside them (`demos/llvm/prepare-sources.sh`).
Left to the compiler round, which builds `llvm-cc` in any case: it compiles the driver with the
header at its new path, `/tmp/dolly-compiler/commands/toolchain.h`, as `compiler-main.c` does in
the checkout.

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

## Closed (2026-11-17)

`grep -rn toolchain process/ host/runtime/module.json` finds nothing. On the rebuilt seed (image
inputs `58c25885…`, the same from a second checkout of `5cb1dbdb5`), `system-build` links the four
front ends with the proxy and builds libc++ with `c++` and `ar`, and `cpp-browser` and
`process-browser` pass in Chromium and Firefox (`work/audit-1116-evidence/core/fix-seed/cpp-browser.log`,
`process-browser-3.log`, `-4.log`).
