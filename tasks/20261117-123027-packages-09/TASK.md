# mojo-llvm builds libzstd from the zstd package's own pin

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: `mojo-llvm` installs the `zstd` package and points LLVM's CMake at its
`libzstd.a` and headers; its Makefile, `mojo/zstd.tar` and that tar's staging are gone. Mojo's
compiler links `-lzstd` through `bazel-to-cmake.py`'s third-party library (it took `libzstd.a`
from `/opt/mojo-llvm/lib`), and its licence copy comes from the package.

Mojo is a heavy chain this tree does not build: the next round builds `mojo-llvm`, `mojo`,
`mojo-gpu` and `deep-hedger` and runs the mojo test.

The `mojo/zstd.tar` row and its staging are gone; nothing else of Mojo's staged sources changes for this.

## Candidate

- Who installs it: Mojo's LLVM (precompiled Mojo packages are compressed), Blender, sessions.
- What the consumers lose: a second libzstd build from the same `DOLLY_ZSTD` pin, without the
  package's legacy formats and dictionary builder.
- Its own build: the zstd package's Makefile (upstream's files and flags).
- Verdict: done.
