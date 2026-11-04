# A library reaches a C _Thread_local its host exports

- STATUS: OPEN
- PRIORITY: 110
- TAGS: compiler,dso,threads,seed

Left by the C++ catch fix (`tasks/20261103-132540-dso-cpp-catch`, closed 2026-11-04): a library's
`GOT.mem` import of a host's C++ `thread_local` gets the address its `_ZTW` wrapper returns, but a
C `_Thread_local` has no wrapper, and the loader (`host/dso/process.mjs`) cannot tell its exported
value, an offset from `__tls_base`, from an address. wasm-ld records thread-local exports only in a
PIC output's `dylink.0`. Decided by the integrator: the compiler records which of an executable's
exports are thread-local (the exact fix the pydata agent named), so the loader adds the thread's
`__tls_base`. A seed change: with a compiler round. Nothing in the catalog needs it today; a C
library that reads its host's `errno`-like `_Thread_local` would.

Done when: a `-shared` library reads and writes a C `_Thread_local` its `-rdynamic` host exports,
from two threads, each seeing its own value, in `test/dso-browser.mjs` in Chromium and Firefox
(fails before).
