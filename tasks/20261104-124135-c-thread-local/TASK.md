# A library reaches a C _Thread_local its host exports

- STATUS: OPEN
- PRIORITY: 110
- TAGS: compiler,dso,threads,seed

## State (2026-11-18, the compiler batch)

Left out of 0.1.8's compiler round, by finding: the compiler cannot record it without a change to
LLVM. A non-PIC executable carries no mark of which of its exports are thread-local (wasm-ld
writes `WASM_DYLINK_EXPORT_INFO`, with the TLS flag, only into a PIC output's `dylink.0`, and a
library's import info lists weak imports alone: `lld/wasm/SyntheticSections.cpp`), and nothing
the driver has after the link tells them apart: an export's value is an offset for a
thread-local and an address for other data, and offsets reach past the 1,024 below which no
data lies once a program's TLS block is larger. What it could do instead, each weighed against
"nothing in the catalog needs it":
- a patch to lld writing that list into an executable's own section: it changes `llvm-build`,
  so the compiler round that takes it has no fixed point and needs a second (the patch goes
  with the next LLVM pin);
- the symbol tables of every object the link loads (`--trace` lists them, archive members
  included): reading them doubles a large host's link (CPython, Blender, rustc);
- `--emit-relocs`, whose output's symbol table carries the flag, and the relocations stripped
  after: relocation sections the size of the code, for every `-rdynamic` link.

The loader's side is small once a list exists: a `GOT.mem` import of a listed export gets
`__tls_base` of the thread placing the library (each thread's Worker places it) added, which the
host would export (`rdynamic.exports`).

## State (2026-11-16, the audit)

Not started. The loader still reaches a host's thread-locals only through the C++ `_ZTW` wrapper
(`host/dso/process.mjs:140-163`). The compiler records no list of thread-local exports. 0.1.6's and
0.1.7's compiler rounds did not take it.

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
