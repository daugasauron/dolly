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

Tested: its amy case (`demos/tools/test/amy-cases.json`, run alone with the other new packages'
cases) passed in Chromium and Firefox (`work/packages-evidence-1117/runs/test-amy-new.log`). The
FreeType session of `demos/zero-ad/test/amy-browser.mjs` (`pkg-config --static --libs freetype2`,
now with Brotli) passed in both (`test-amy-zero-ad.log`).

Built in `work/packages`: `blender-deps` over the packages (460,838,815 bytes, 873 s): OpenColorIO
found expat 2.8.5, OpenImageIO {fmt} 12.1.0, TIFF 4.7.2 and JPEG 62 (FindJPEG's `libjpeg.a`, as when
the stage built libjpeg-turbo: OpenImageIO takes libjpeg-turbo's CMake config only for its shared
`libjpeg-turbo::jpeg`), and the stage's embedded interpreter links and runs.

Built and tested in `work/packages`: `wine-build` and `wine` over FreeType with Brotli (431 s);
`demos/wine/test/wine-browser.mjs` passed in Chromium and Firefox (NetSurf drew a PNG and a JPEG,
GIMP, Notepad, Paint; `work/packages-evidence-1117/runs/test-wine.log`).

Built in `work/packages`: `python-data-build` over them (312,221,778 bytes, 910 s): Pillow links
libjpeg-turbo and FreeType with Brotli (`LDFLAGS`), and the build's check imports NumPy, pandas and
seaborn and saves a Matplotlib plot.

`demos/sdl2/test/amy-browser.mjs` failed in its `sdl2` session on integrate/0.1.8's case file
itself: the step ran `mkdir /tmp/amy-sdl2`, the directory the harness makes and enters for the case
(`runSteps`), so it failed before compiling. The step no longer makes it; split into its parts,
SDL_Init, the window and the accelerated renderer pass in Chromium
(`work/packages-evidence-1117/runs/test-sdl2-calls.log`).

Tested: the `python-data` session of `demos/python/test/python-data-browser.mjs` passed in Chromium
and Firefox on python-data over them: Pillow draws text with FreeType
(`ImageFont.load_default(size=20)`), reads Matplotlib's PNG, and every extension module loads,
Pillow's JPEG one among them (`work/packages-evidence-1117/runs/test-python-data.log`; its
`openblas` session needs the openblas package, which neither this tree nor the round has built).

Built and tested in `work/packages` over the packages and python's embed archives: `blender`
(176,888,721 bytes, 3,404 s; its link names `-lbrotlidec -lbrotlicommon` and the embed archives
without `-lHacl_HMAC`); `demos/blender/test/blender-browser.mjs` passed in Chromium and Firefox (its
Python edits, saves and loads a scene, Cycles renders a PNG that Blender loads back;
`work/packages-evidence-1117/runs/test-blender.log`).

Tested: `demos/sdl2/test/amy-browser.mjs` passed in Chromium and Firefox, SDL_ttf over FreeType with
Brotli among its sessions (`test-amy-sdl2.log`).

## Candidate

- Who installs it: everything that installs `freetype` (GTK, SDL_ttf, Xonotic, Wine, python-data,
  0 A.D., Blender) and sessions; `brotli` alone by a program that reads or writes Brotli.
- What the consumers lose: `blender-deps` two builds (Brotli and FreeType, with their staging).
- Its own build: upstream's CMake, `BUILD_SHARED_LIBS=OFF`, no tools.
- Verdict: done. Every FreeType consumer's static link grows by Brotli's decoder and dictionary
  (the archives are 59,066 and 132,582 bytes) for WOFF2 fonts that only Blender has.
