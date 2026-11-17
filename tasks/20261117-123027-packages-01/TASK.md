# Blender's stage builds FreeType again with Brotli beside the freetype package: one FreeType, which reads WOFF2

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: a `brotli` package (Brotli 1.2.1, upstream's newest release, its three
libraries and `.pc` files by its CMake, `demos/tools`, pin `DOLLY_BROTLI_*`, licence record in
`demos/tools/upstreams.json`, an amy case), and the `freetype` package built with it
(`FT_REQUIRE_BROTLI`), so `freetype2.pc` names `libbrotlidec`. `blender-deps` installs `freetype`
and no longer builds Brotli 1.0.10 and FreeType 2.14.3 from Blender's pins; Blender links
`-lbrotlidec -lbrotlicommon` (1.0.10 named its static libraries `*-static`). Where FreeType is
linked by name, Brotli is added: Xonotic's client (`demos/xonotic/Makefile`), Wine
(`demos/wine/Makefile`) and Pillow's `LDFLAGS` (python-data); pkg-config users (GTK, cairo, pango,
SDL_ttf, Matplotlib, 0 A.D., Ghostty) get it from `freetype2.pc`. Brotli's licence is carried where
FreeType's is: Matplotlib's and Pillow's roots, the xonotic and wine images, Blender's folder.
The brotli package's `libbrotlidec.pc` and `libbrotlienc.pc` require `libbrotlicommon` publicly
(upstream's are private), as FreeType's static build does its own: GTK's first build over it failed
linking cairo's `csi-exec`, given `libbrotlidec.a` without `libbrotlicommon.a` (undefined
`_kBrotliPrefixCodeRanges`).

Built in `work/packages`: `brotli` (1,066,837 bytes) and `freetype` over it (1,973,738 bytes;
CMake: "Found BrotliDec").

Tested: its amy case (`demos/tools/test/amy-cases.json`, run alone with the other new packages' cases) passed in Chromium and Firefox (`work/packages-evidence-1117/runs/test-amy-new.log`). The FreeType session of `demos/zero-ad/test/amy-browser.mjs` (`pkg-config --static --libs freetype2`, now with Brotli) passed in both (`test-amy-zero-ad.log`).

Built in `work/packages`: `blender-deps` over the packages (460,838,815 bytes, 873 s): OpenColorIO found expat 2.8.5, OpenImageIO {fmt} 12.1.0, TIFF 4.7.2 and JPEG 62 (by FindJPEG: the libjpeg-turbo package keeps no CMake config, which OpenImageIO tries first), and the stage's embedded interpreter links and runs.

## Candidate

- Who installs it: everything that installs `freetype` (GTK, SDL_ttf, Xonotic, Wine, python-data,
  0 A.D., Blender) and sessions; `brotli` alone by a program that reads or writes Brotli.
- What the consumers lose: `blender-deps` two builds (Brotli and FreeType, with their staging).
- Its own build: upstream's CMake, `BUILD_SHARED_LIBS=OFF`, no tools.
- Verdict: done. Every FreeType consumer's static link grows by Brotli's decoder and dictionary
  (the archives are 59,066 and 132,582 bytes) for WOFF2 fonts that only Blender has.
