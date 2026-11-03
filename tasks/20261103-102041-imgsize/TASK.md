# Audit: what makes the images large, and what can be stripped

- STATUS: OPEN
- PRIORITY: 230
- TAGS: images,audit

Owner (2026-11-03): "I also want an audit of what is making the images so large, I think it's
fonts mainly? I think a lot of that can be stripped."

## State (2026-11-03 20:10 JST)

Measured: the table and findings below. In progress on `audit/image-size`: the terminal's
font subset to the glyphs a program can draw (7.7 MB to 0.9 MB, no drawn pixel changes) and
Git's HTTPS helper as a script instead of a second copy of the HTTP one. Waiting for the
owner: the proposals below (what `system`, `default` and `cc` contain).

## How an image reaches a page

A snapshot (`src/snapshot-records.mjs`) is a sorted list of records: directory, file or
link, each with its path and bytes. A page never fetches the snapshot file: it fetches the
image's packs (`dist/packs/SHA.snapshot.gz`, gzip level 6, `src/packaged-snapshot.mjs`),
each a snapshot of 2 to 4 MiB, with `cache: "force-cache"`. Packaging a site
(`scripts/share-pages-snapshots.mjs`) puts each identical record (same path, same bytes) into
exactly one pack, grouped by the images that hold it, so a browser that opened `default`
downloads only what `system` holds beyond it. The kernel restores the records into Wasm
memory: the uncompressed size is memory, the compressed size is download.

## What the images hold (2026-11-03, before the changes below)

MB uncompressed / MB gzip (level 6 per file, as packs compress), decoded with
`decodeSnapshotRecords` from this tree's `dist/` (builds of 3 November, seed `fe5261db`):

| Image | Total | Fonts | Wasm programs | Static archives | Headers | JavaScript | Python | Model | Docs, licences, tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| default | 19.0 / 7.1 | 12.0 / 4.5 | 6.4 / 2.5 | – | 0.3 / 0.1 | – | – | – | 0.1 / 0.0 |
| system | 161.1 / 46.1 | 12.0 / 4.5 | 110.5 / 32.0 | 19.5 / 6.5 | 18.2 / 2.9 | – | – | – | 0.3 / 0.1 |
| pi-minimal | 98.9 / 30.3 | 12.0 / 4.5 | 25.2 / 8.6 | 1.6 / 0.6 | 0.3 / 0.1 | 56.7 / 15.6 | – | – | 2.6 / 1.0 |
| pi-phone | 380.4 / 199.6 | 12.0 / 4.5 | 133.2 / 39.1 | 21.1 / 7.1 | 18.3 / 2.9 | 56.7 / 15.6 | – | 135.4 / 129.2 | 2.9 / 1.0 |
| python | 49.6 / 16.1 | – | 13.8 / 4.0 | 13.1 / 4.5 | 2.0 / 0.5 | – | 16.7 / 4.4 | – | 0.3 / 0.1 |
| cc | 134.3 / 36.2 | – | 96.6 / 26.8 | 19.4 / 6.4 | 17.8 / 2.8 | – | – | – | 0.1 / 0.0 |
| cmake-build | 194.8 / 53.4 | 12.0 / 4.5 | 133.4 / 35.9 | 19.8 / 6.6 | 18.5 / 3.0 | – | – | – | 3.7 / 1.5 |
| zig-build | 195.2 / 45.0 | – | 106.0 / 29.4 | 19.4 / 6.4 | 31.4 / 3.8 | – | – | – | 0.5 / 0.2 |

What a page downloads, packs shared: `default` 7.1 MB; `system` 46.1 MB cold, 39.0 MB after
`default`; `pi-minimal` 30.3 cold, 23.3 after `default`; `pi-phone` 199.6 cold, 130.4 after
`system` and `pi-minimal` (its speech model is 129.2 of it); `cmake-build` 7.4 and `zig-build`
8.4 after `system`. By origin: `default` is 71% `display` (5.1 of 7.1 MB gzip), 19% `posix`;
`system` is 78% `cc` (36.2 MB), 11% `display`, 6% Git; `pi-minimal` is 57% Pi's npm tree,
17% `display`, 15% QuickJS and Pi's runtime.

## Findings, by compressed bytes

1. **The fonts** are 12.0 MB (4.5 MB gzip) in every image with the terminal: 63% of
   `default`, 7% of `system`. `display.c` reads IosevkaTerm when the terminal starts and
   keeps its bytes in the display's heap (a second copy beside the file); it reads the two
   fallbacks only when a character first needs one (`fallback_glyph`), and a missing
   fallback is a box, not an error.
   - IosevkaTerm-SemiBold.ttf: 7.70 MB (2.17 gzip), 46,736 glyphs for 7,582 mapped
     characters; glyf 4.73 MB, GPOS 1.42, glyph names 0.95, GSUB 0.27. The rest are
     character variants and stylistic sets (cv01–cv99, ss01–ss20) that stb_truetype never
     reaches: it maps a code point through cmap and draws that glyph, without shaping.
     Kept to the glyphs of the mapped characters plus those the default OpenType features
     reach (so HarfBuzz users, Ghostty's GTK build and Wine, shape as before): 0.92 MB
     (0.38 gzip), saving 6.78 MB and 1.79 MB gzip per image. Every one of the 7,582
     characters and glyph 0 renders to the same bitmap, box and advance at six sizes,
     stretched and not (`build/imgsize-evidence/fontcompare.c`, 90,648 bitmaps, 0
     differences; it finds the 48 differences of a font with one moved point). Dropping the
     default features too would save 0.07 MB gzip more and change GTK shaping: not done.
     A subset to fewer characters (Latin only) would save at most 0.3 MB gzip more and
     lose characters programs print: not worth it.
   - DroidSansFallback.ttf: 3.45 MB (1.66 gzip), 20,902 CJK ideographs and 11,172 Hangul
     syllables; its unmapped glyphs are components, so a lossless subset saves nothing.
     Only a smaller character set or a package would: proposal 2.
   - NotoEmoji-Regular.ttf: 0.88 MB (0.58 gzip); lossless subset 0.79 MB (0.53): 41 KB
     gzip, not worth a step.
   - The page's own `IosevkaTerm-SemiBold.woff2` (1.07 MB) loads only on the menu,
     sessions and recipe pages, once per browser; not an image cost.
2. **DWARF in the C runtime's archives**: 13.84 MB of the 19.4 MB of static archives in
   `cc`, `system` and every toolchain; whole-file gzip 6.45 MB to 1.60 MB without it, 4.85
   MB per compiler image (10% of `system`'s download, 13% of `cc`'s). libc++, libc++abi and
   libunwind are compiled `-Oz -g` in `Dollyfile-system-build`; libc (both builds) and
   compiler-rt's builtins are Emscripten's archives as `embuilder` makes them, with debug
   information, copied by `scripts/prepare-process-sysroot.sh` and
   `scripts/build-process-threads.sh`. Programs linked without `-g` carry none of it (Git,
   the compiler).
   Proposal 1.
3. **The compiler**, `/usr/libexec/dolly/process-bin/compiler`: 96.1 MB (26.6 gzip), 60% of
   `system`, already Release with only the WebAssembly target and its names stripped.
   Smaller would mean MinSizeRel or LTO in `demos/llvm` (a multi-hour bootstrap build),
   measured there, not guessed here.
4. **`libpython3.14.a`** in `python`: 13.1 MB (4.5 gzip), 28% of the package, for programs
   that embed CPython; nothing in the catalog links it. Proposal 3.
5. **Pi's npm tree** is 57% of `pi-minimal`: its own `docs/images` are four PNGs of 2.48 MB
   (2.32 gzip, 8% of the download); Pi reads its docs when asked about itself, so they stay
   unless the owner decides otherwise. TypeScript declarations and examples are what Pi
   reads to write extensions: they stay.
6. **Duplicates**: `git-remote-https` was a second copy of `git-remote-http` (1.3 MB, 0.5
   gzip) in every image with Git, because `system-build` has no `ln` (fixed below);
   compiler-rt's builtins are in three archives (two identical, 0.81 MB each).
7. **Clang's resource headers for other targets** (x86 3.36 MB, GPU 1.35, PowerPC and s390
   1.16, Hexagon 0.81, LoongArch 0.30) are 7.1 MB but 0.66 MB gzip in every compiler image;
   they are Clang's install as upstream ships it. Not worth a deviation.
8. **Zig's library tests**: `zig-build` holds `lib/zig/compiler_rt/*_test.zig` (12 MB, 0.5
   gzip); upstream's install writes `*test.zig` files empty. For the Zig 0.17 upgrade.
9. **Name sections**: `cmake` carries 9.9 MB of names (of 23.1 MB; 0.44 MB gzip), Ripgrep and
   fd 1.5 MB. They make crash and profile traces readable; small compressed. Left.
10. Locales, man pages and test data are under 1% everywhere. CPython's test suite is
    already out; `idlelib` and `tkinter` (2 MB, 0.6 gzip) have no Tk to run against.

## Proposals for the owner

1. Build the C runtime's archives without DWARF: `-Oz` instead of `-Oz -g` in
   `Dollyfile-system-build`'s libc++ flags, and `llvm-strip --strip-debug` on the archives
   `prepare-process-sysroot.sh` and `build-process-threads.sh` copy. Saves 13.8 MB of memory and 4.85 MB of download per
   compiler image; costs libc's and libc++'s source lines in a debugger for a `-g` program.
   A seed and base change: a catalog round.
2. Move Droid Sans Fallback into its own package (`amy install cjk-fonts`), leaving Noto
   Emoji in `display` since agents print emoji. Saves 3.45 MB and 1.66 MB gzip in every
   image with the terminal (`default` after the Iosevka subset: 5.3 to 3.6 MB gzip); without
   the package, Chinese, Japanese and Korean show as boxes. `display.c` needs no change.
3. Split `libpython3.14.a` into a `libpython` package: `python` 16.1 to 11.6 MB gzip; a
   program that embeds CPython installs it.
