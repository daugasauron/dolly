# What each demo costs a full rebuild against what it shows: Ghostty's GTK app with Zig's LLVM is 18.7%, eight chains 69%

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: audit,ports,build,demo,0.1.8

## State (2026-11-17)

Decided (below). The duplicated LLVM 22 is `tasks/20261116-140603-buildtime-06`; that a version
bump rebuilds every image is `tasks/20261116-140453-buildtime-01`. Images the decision rebuilds:
none.

## Measurement

Every image's `dolly: packaged N byte IMAGE snapshot ... in T s` line of the 0.1.7 round
(`work/round1113/build/round-1117-evidence/catalog-1.log`, 230 images, two builds at a time),
joined with each image's recipe directory and with the recipes' `FROM`, `INSTALL`, `USE`,
`TOOLCHAIN` and `COPY` rows. "Marginal" is what the published catalog
(`config/domain-pages-images.txt` plus `config/npm-images.txt`, 225 images in closure, 11.34 h of
image build time) would no longer build without that demo's own entries, including images of
other directories only it needs. Scripts and outputs: `work/audit-1116-evidence/ports/`
(`per-demo.mjs`/`per-demo.txt`, `marginal.mjs`/`marginal.txt`, `packaged.tsv`).

| Demo | Marginal images | Build time | Share | Bytes | What it shows |
| --- | --- | --- | --- | --- | --- |
| zig + ghostty-gtk | 6 (llvm22-tablegen, llvm22, zig-llvm-build, zig-llvm, ghostty-gtk, ghostty-x11) | 127.5 min | 18.7% | 1.68 GB | Ghostty's GTK application on X; the `zig-llvm` package |
| lean | 5 (with stack-wrap) | 75.8 min | 11.1% | 3.43 GB | the `lean` package |
| llvm | 4 | 60.9 min | 8.9% | 2.05 GB | the seed compiler's own build (bootstrap) and the `llvm` package |
| mojo | 3 | 50.3 min | 7.4% | 1.03 GB | the Mojo compiler and its WebGPU kernels |
| codex | 3 (with protox) | 42.4 min | 6.2% | 0.45 GB | the Codex CLI |
| godot | 10 (with scons) | 39.8 min | 5.8% | 0.93 GB | Godot's editor and three games |
| photocraft | 2 | 35.9 min | 5.3% | 0.45 GB | the PhotoCraft editor on gpu@0 |
| zero-ad | 13 (with cbindgen) | 35.5 min | 5.2% | 4.89 GB | 0 A.D. |
| python | 8 | 16.4 min | 2.4% | 0.72 GB | CPython and the data packages |
| local-llm | 8 | 14.6 min | 2.1% | 9.81 GB | Pi with a model in the page |

The other 26 demos cost 2.8 minutes or less each (`marginal.txt`). The eight chains at the top
are 468 of the round's 680 image-minutes (69%); without the seed compiler's chain, seven
showcases are 407 minutes (60%). Rust's own packages cost 0.6 minutes at the margin because
others hold up its toolchain (`rust-llvm` and `rust-build`, 63 min): Codex, PhotoCraft, 0 A.D.
(cargo and cbindgen for SpiderMonkey, naga for its shaders) and Xonotic (naga for its shaders);
even Rust, Codex, PhotoCraft and 0 A.D. together drop only 115.1 min (16.9%), the toolchain
staying for Xonotic's shaders.

- Ghostty's GTK application is the largest single cost: `ghostty-gtk` `USE`s `zig-llvm`
  (`demos/ghostty-gtk/Dollyfile-ghostty-gtk:14`) because `zig build` needs Zig's LLVM backend,
  and that is LLVM 22 built for it alone (`llvm22`, 75.9 min, the longest image of the round)
  plus Zig's compiler compiled to C and back (`zig-llvm-build`, 28.9 min). The terminal every
  page shows is the core's Ghostty, built by the core's C-backend Zig (`Dollyfile-zig-build`,
  8.3 min). With `ghostty-x11` removed (`tasks/20261116-135249-ghostty-01`) the application
  stays as a package for `x11-desktop`, so this cost stays. The port also carries 2,369 lines of
  patches (`demos/ghostty-gtk/*.patch`), among them 185 added lines of a renderer for Mesa's
  softpipe that shades only changed rows (`ghostty-dolly.patch`, `src/renderer/generic.zig`).
- Bytes: of the 37.3 GB the 230 snapshots hold, `local-llm` is 9.81 GB (26%) for 14.6 minutes
  of build (the model packages), `zero-ad` 4.89 GB (13%), `lean` 3.43 GB (9%).
- Other demos install recipes these demos own: 35 recipes are taken by a demo other than their
  own (`shared-packages.sh`, `shared-packages.tsv`). Beside the toolchains (`python` by seven
  demos, `sdl2` by five, Rust's `ripgrep`, `fd` and `naga`) and `demos/tools`, which holds
  generic ones (`xz`, `meson`, `tar`, `binaryen`, `sqlite`), generic libraries sit in the
  demo that first needed them: `zero-ad`'s `freetype` (python, sdl2, wine, xonotic) and
  `pkgconf` (gtk, python, x11), `xonotic`'s `libjpeg` (python) and `libvorbis` (zero-ad),
  `tmux`'s `libterminfo` (x11, zsh), `cmake`'s `libuv` (lean), `python`'s `libffi` (gtk).
  Leaving a chain out of the catalog keeps them; deleting `zero-ad` or `xonotic` would not.
  Their staging and the copies GTK builds itself: `tasks/20261116-161039-ports-12`.
- AGENTS.md: "Development iteration speed is king. Long turnover kills projects."

## Smallest fix

For each of the seven showcase chains, the owner decides whether a release round builds it.
A chain left out keeps its recipes and its test, leaves `config/domain-pages-images.txt`, and is
built by `npm run image -- IMAGE` when its demo is worked on. A demo deleted outright first
moves the recipes other demos install to `demos/tools`.

## Done when

The decision for each chain is recorded here, and the release round's catalog list matches it.

## Closed (2026-11-17)

Decided for 0.1.8: every chain stays in the release round's
catalog (Ghostty's GTK application with Zig's LLVM, Lean, the LLVM package, Mojo, Codex, Godot,
PhotoCraft, 0 A.D.). The ported programs are the evidence of the interface (AGENTS.md, Goal), and
what made this task urgent, that a version bump rebuilt them all, is
`tasks/20261116-140453-buildtime-01`'s: with versionless recipes a chain is rebuilt when its inputs
or the seed change, as a compiler round requires of every image. No demo is removed, so
`config/domain-pages-images.txt` and `config/npm-images.txt` are unchanged and match the decision.
