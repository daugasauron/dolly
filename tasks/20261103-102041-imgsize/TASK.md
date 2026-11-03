# Audit: what makes the images large, and what can be stripped

- STATUS: OPEN
- PRIORITY: 230
- TAGS: images,audit

Owner (2026-11-03): "I also want an audit of what is making the images so large, I think it's
fonts mainly? I think a lot of that can be stripped."

## State (2026-11-03 21:00 JST)

Done on `audit/image-size` (below): the terminal's font subset to the glyphs a program can
draw (7.7 MB to 0.9 MB, no drawn pixel changes) and Git's HTTPS helper as a script instead
of a second copy; `default` and `system` rebuilt and tested, the rest of the catalog waits
for the next round. Waiting for the owner: the three proposals (what `system`, `default`,
`cc` and the packages contain); the first is prototyped and measured on
`proposal/image-size-dwarf` (27eeb83f6).

## How an image reaches a page

A snapshot (`src/snapshot-records.mjs`) is a sorted list of records: directory, file or
link, each with its path and bytes. A page never fetches the snapshot file: it fetches the
image's packs (`dist/packs/SHA.snapshot.gz`, gzip level 6, `src/packaged-snapshot.mjs`),
each a snapshot of 2 to 4 MiB, with `cache: "force-cache"`. Packaging a site
(`scripts/share-pages-snapshots.mjs`) puts each identical record (same path, same bytes) into
exactly one pack, grouped by the images that hold it, so a browser that opened `default`
downloads only what `system` holds beyond it. The kernel restores the records into Wasm
memory: the uncompressed size is memory, the compressed size is download. Beside the
image, a page loads the runtime: 0.24 MB of Wasm and at most 0.6 MB of JavaScript (`src/`,
`host/`), 0.25 MB gzip together; the 116 MB seed (`dist/dolly.data`) only for a root build.

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
     A subset to fewer characters would save at most the 0.38 MB gzip left and lose
     characters programs print: not worth it. Memory drops twice as much as the image,
     since the display holds a copy of the file in its heap: 13.5 MB per tab.
   - DroidSansFallback.ttf: 3.45 MB (1.66 gzip), 20,902 CJK ideographs and 11,172 Hangul
     syllables; its unmapped glyphs are components, so a lossless subset saves nothing.
     Only a smaller character set or a package would: proposal 2.
   - NotoEmoji-Regular.ttf: 0.88 MB (0.58 gzip); lossless subset 0.79 MB (0.53): 41 KB
     gzip, not worth a step.
   - The page's own `IosevkaTerm-SemiBold.woff2` (1.07 MB) loads only on the menu,
     sessions and recipe pages, once per browser; not an image cost. The same subset as
     WOFF2 is 0.24 MB, but writing WOFF2 takes Brotli, a compiled module for fontTools,
     and the file is part of the npm packages' interface (`docs/embedding.md`): left.
2. **DWARF in the C runtime's archives**: 13.84 MB of the 19.4 MB of static archives in
   `cc`, `system` and every toolchain; whole-file gzip 6.45 MB to 1.60 MB without it, 4.85
   MB per compiler image (10% of `system`'s download, 13% of `cc`'s). libc++, libc++abi and
   libunwind are compiled `-Oz -g` in `Dollyfile-system-build`; libc (both builds) and
   compiler-rt's builtins are Emscripten's archives as `embuilder` makes them, with debug
   information, copied by `scripts/prepare-process-sysroot.sh` and
   `scripts/build-process-threads.sh`. Programs linked without `-g` carry none of it (Git,
   the compiler). Proposal 1.
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
   compiler-rt's builtins are in three archives (two identical, 0.81 MB each). In
   `pi-minimal`, `/usr/bin/pi`, `janis` and `janis-install` are one 1.37 MB QuickJS runtime
   linked three times (`demos/pi/pi.c`, `demos/javascript/janis.c`, `janis-install.c`
   differ only in the module `dolly_quickjs_run` starts; the binaries differ in 80
   bytes). As Slop scripts that run `janis -m MODULE "$@"`, as `git-remote-https` now does,
   the image would hold one: 2.75 MB and 0.99 MB gzip less (3% of its download), and the
   packages would install `janis`. Not done: Pi's tests need the Rust chain rebuilt, and
   `process.argv[0]` would name `janis` where it names `pi`.
7. **Clang's resource headers for other targets** (x86 3.36 MB, GPU 1.35, PowerPC and s390
   1.16, Hexagon 0.81, LoongArch 0.30) are 7.1 MB but 0.66 MB gzip in every compiler image;
   they are Clang's install as upstream ships it. `prepare-kernel-seed.sh` already drops
   Emscripten's `arm_neon.h` ("Dolly's compiler is no ARM compiler"), and a header that
   `#error`s on wasm64 only misleads `__has_include`; the precise set would be the headers
   that fail to compile alone for wasm64 and that no compiling header includes. Small in
   download; 7 MB of memory in each compiler tab. Left for the owner with proposal 1.
8. **Zig's library tests**: `zig-build` holds 89 `*test.zig` files under `/usr/lib/zig`
   (13.5 MB, 0.71 gzip; `compiler_rt/udivmodti4_test.zig` alone is 10.2 MB); upstream's
   install writes `*test.zig` files empty (`blank_extensions` in its `build.zig`). Its
   `include` (13.4 MB, 0.97 gzip) is Clang's headers for every target, as in finding 7.
   For the Zig 0.17 upgrade.
9. **Name sections**: `cmake` carries 9.9 MB of names (of 23.1 MB; 0.44 MB gzip), Ripgrep and
   fd 1.5 MB. They make crash and profile traces readable; small compressed. Left.
10. After the fonts, `default` is `posix`'s 58 programs (3.18 MB, 1.34 gzip, 48 KB median,
    each linking its own libc) and `core`'s 20 (1.00 MB, 0.42 gzip). sbase's multi-call
    build (`sbase-box`) is the known alternative; not measured.
11. Packs at gzip level 9 instead of 6 would save 0.4% (`default`) to 0.6% (`system`,
    42.66 to 42.38 MB): not worth it. Another codec than the page's
    `DecompressionStream("gzip")` was not examined.
12. Locales, man pages and test data are under 1% everywhere. CPython's test suite is
    already out; `idlelib` and `tkinter` (2 MB, 0.6 gzip) have no Tk to run against.

## Done on `audit/image-size`

Measured on this tree's builds (seed `fe5261db`), bytes uncompressed / packs' gzip bytes:

| Image | Before | After | Saved |
| --- | --- | --- | --- |
| display | 13,988,465 / 5,065,884 | 7,214,293 / 3,243,255 | 6.77 MB / 1.82 MB (36% of the download) |
| default | 19,010,276 / 7,043,672 | 12,235,968 / 5,221,287 | 6.77 MB / 1.82 MB (26%) |
| git | 7,335,705 / 2,597,515 | 6,065,193 / 2,139,799 | 1.27 MB / 0.46 MB |
| system | 161,218,920 / 45,221,404 | 153,174,304 / 42,942,032 | 8.04 MB / 2.28 MB (5%) |

- The terminal's font, subset with fontTools 4.68.0 (pinned, run by the host's Python like
  the other host steps) in `scripts/fetch-iosevka.sh`: `--unicodes='*' --notdef-outline`
  and every name record, so the OFL notice stays (Iosevka reserves no font name). The
  output is the same bytes on every run (`cb3fd282…`), so the recipe's pin holds.
- `git-remote-https` is a two-line Slop script that runs `git-remote-http`, as the
  dashed builtins beside it already are; remote-curl reads its URL, not its name.
- Tested in Chromium and Firefox: `terminal` (its CJK, emoji and box cells among them),
  `core`, `display`, `shell` (the HTTPS helper lists a fixture's refs, a new line),
  `network` (clones through the relay), `default` (with `python` and `zig` in the catalog),
  `man` (`amy install git` into `default`), `display-cursor`, `pty`, `slop`,
  `snapshot-stream`, `session-offline`.
- Not rebuilt here: everything else built on `display` or `system-tools`, which the next
  catalog round rebuilds. `pi-minimal`'s closure includes the Rust toolchain (ripgrep and fd
  are built FROM `rust-build`, which takes `display` through `rust-sdk` and through
  `rust-llvm`'s `system-tools`), a `hugebuild`.

## Proposals for the owner

1. **The C runtime's archives without DWARF** (prototype on `proposal/image-size-dwarf`).
   `emstrip --strip-debug` over Emscripten's archives in `prepare-process-sysroot.sh` and
   over the seed's compiler-rt in `build.sh`, and `-Oz` instead of `-Oz -g` for libc++,
   libc++abi and libunwind in `Dollyfile-system-build`; the sysroot's source test gives its
   fake toolchain an `emstrip`. Programs link without `-g`, so none of that DWARF reached a
   program. Measured on top of the font and Git
   changes: the seed 116.20 to 110.16 MB; `system` 153.17 to 139.78 MB (42.94 to 38.11 MB
   gzip, 11% less to download); `cc` 134.39 to 120.99 MB (35.40 to 30.56 MB gzip, 14%);
   `zig-build` 195.41 to 182.02 MB; every compiler image the same 13.4 MB and 4.84 MB gzip.
   Chromium and Firefox pass `cpp` (its `-g` programs among them), `dso`, `threads`,
   `process` and `core`. It costs the source lines of libc and libc++ in a debugger for a
   program built with `-g` (the program's own stay). A seed change: every image rebuilds.
2. **Chinese, Japanese and Korean in a package.** A `cjk-fonts` package holding Droid Sans
   Fallback and its NOTICE (the two `COPY` rows moved out of `Dollyfile-display`), installed
   by `system-tools` beside `display`, so `system` and every image built on it draw them as
   now; Noto Emoji stays in `display`, since agents print emoji. `default`, `pi-minimal`,
   `fingers` and `zero-ad`, which install `display` themselves, save 3.45 MB and 1.66 MB
   gzip: `default` after the Iosevka subset 5.2 to 3.6 MB gzip, a third less. There those
   characters are boxes until `amy install cjk-fonts`, and stay boxes in the open tab:
   `display.c` remembers a missing fallback for as long as the terminal runs
   (`loaded = -1`), so it would have to look again for the install to help at once. The
   amy test's list gains the package, used by `terminal-browser.mjs` through `system`.
3. **A package's build files apart from its programs.** `python` carries `libpython3.14.a`
   (13.1 MB, 4.5 MB gzip, 28% of the package) for programs that embed CPython; nothing in
   the catalog links it. `pi-minimal` carries QuickJS's archive and headers (1.9 MB, 0.7
   gzip) and `default` curl's headers, with no compiler in either image. A `libpython`
   package (and the like for QuickJS) would take `python` from 16.1 to 11.6 MB gzip. This
   is Debian's `-dev` split; it changes what packages are, so it is the owner's design.

## Lessons

- Rank by compressed bytes, not file size: headers shrink six times in gzip, PNGs and
  model weights not at all. The owner's guess (fonts) holds for `default` (63%); `system`
  is the compiler (60%) and debug information that no program links (10%).
- A font carries what its users never reach: Iosevka has six glyphs per mapped character
  for the variants OpenType features select. Rendering every glyph of both fonts with the
  terminal's own rasterizer turns "lossless" from a claim into a 0.3-second check.
- Simulate before rebuilding a seed: dropping the DWARF sections from the decoded
  snapshot's archives in Node predicted 4.85 MB gzip; the rebuilt seed and images saved
  4.84. The simulation took a minute, the prototype an hour.
- Plan before building: `DOLLY_BUILD_IMAGES=… npm run image -- --plan` shows the closure.
  `default` and `system` rebuild in 3.5 minutes, but `pi-minimal` reaches the Rust
  toolchain (ripgrep, fd), and `system-tools` installs `display` as `architecture.md`
  says: a font change is a `hugebuild` for an image with a 0.9 MB font in it.
- A narrowed catalog narrows `amy-index.txt` and the packages tests compose:
  `default-browser.mjs` needs `python` and `zig` in it, `dso-browser.mjs` `libdolly-gpu`.
  Their failures then say nothing about the change under test; name them in
  `DOLLY_BUILD_IMAGES` (a reused image costs seconds).
