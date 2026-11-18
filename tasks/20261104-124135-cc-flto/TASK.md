# cc -flto: a project that asks for LTO builds unchanged

- STATUS: OPEN
- PRIORITY: 170
- TAGS: toolchain,compiler,python,seed

## State (2026-11-18, the compiler batch)

Done on `fix/compiler-batch` for 0.1.8's compiler round. The driver (`programs/compiler.cpp`)
takes `-flto`, `-flto=full`, `-flto=thin` and GCC's `-flto=auto` and `-flto=jobserver` (full, as
Clang takes them), and `-fno-lto` after them: a unit compiles with cc1's `-emit-llvm-bc
-flto=MODE -flto-unit`, Clang's own arguments for the target (read from the pinned Emscripten
container's Clang, the same LLVM commit), and wasm-ld compiles the bitcode at the link, at its
default `--lto-O2` as Clang leaves it. `ar` reads the symbols of bitcode members (it initializes
the targets as Clang does). `python-data-build` drops `-Db_lto=false`: Matplotlib builds as
upstream configures it, which makes its build longer (Godot's took twice as long, above).

Proved: `llvm-cc` built with the driver (its recipe's check: the seed's and this compiler compile
its sample to the same bytes), and in that image (Chromium) the case added to
`test/cases/cpp.json` passes: a unit compiled with `-flto` is bitcode, an archive of it links
with an ordinary object and runs, and `-flto=thin` compiles and links two units in one command.
With the seed compiler it fails (status 64, the option refused).

The round confirms: `test/cpp-browser.mjs` on the pinned compiler, `python-data-build` building
Matplotlib with LTO and `demos/python`'s tests, and the fixed point.

## State (2026-11-16, the audit)

Not started. 0.1.6's and 0.1.7's compiler rounds did not take it, and `programs/compiler.cpp:387`
still refuses `-flto`. The cost now measured (below) is for the integrator's decision of 2026-11-04
to weigh again: a project that asks for LTO would build about twice as slowly.

From the owner's Matplotlib report (`tasks/20261103-141816-mplreport`, closed 2026-11-04): Meson
sets `b_lto` for Matplotlib by default, and Dolly's `cc` refuses `-flto`, so a session building it
from PyPI stops until `-Db_lto=false` is passed; python-data's recipe passes it. Clang emits LTO
bitcode for wasm and wasm-ld links it (upstream's Emscripten supports `-flto`), and the compiler
binary holds both, so the refusal is the driver's (`src/compiler.cpp`), not a missing capability.
Decided by the integrator: yes, `cc -flto` (and `-flto=thin`) compiles to bitcode and the link
runs wasm-ld's LTO, so upstream builds that ask for it work unchanged. A seed change (the driver):
it goes with a compiler round.

Measured since (`tasks/20261109-131500-wasm-cpu-speed`, 2026-11-10): the driver's `-flto=thin` made
Godot's image build in 1647 to 1769 s instead of 830 to 985 s. Dolly's lld generates every module's
code in the link, on one thread. The editor was 4 to 8% faster. A project that asks for LTO
therefore builds about twice as slowly once the driver accepts it.

Done when: `cc -flto -c` writes bitcode and a link of bitcode and ordinary objects runs, checked
natively in `test/` and in `test/cpp-browser.mjs` in Chromium and Firefox; python-data-build drops
`-Db_lto=false` and builds Matplotlib as upstream configures it; the compiler round's fixed point
holds.
