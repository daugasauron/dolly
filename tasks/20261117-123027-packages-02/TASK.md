# Three JPEG libraries: GTK and Blender build libjpeg-turbo for themselves, beside IJG's libjpeg package

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: a `libjpeg-turbo` package (3.2.0, the pin GTK had, `DOLLY_LIBJPEG_TURBO_*`
now in `demos/tools`, by its CMake without SIMD; its licence asks for `README.ijg`, kept beside
`LICENSE.md`). `gtk-build`, `blender-deps` (which built 2.1.3 from Blender's pin), `libtiff`,
`python-data-build` (Pillow) and `xonotic-build` install it. IJG's `libjpeg` 9f package is gone:
Xonotic's client and Pillow link libjpeg-turbo, the xonotic image carries its licence and its
`NOTICE` names it, `docs/licences.md` says so. Wine's NetSurf still compiles IJG's units into its
Winelib module, so the `DOLLY_JPEG_*` pin and its licence record moved to `demos/wine`. The Pi
skill names `libjpeg-turbo` among the libraries a session installs.

Built in `work/packages`: `libjpeg-turbo` (960,171 bytes) and `libtiff` over it.

Built in `work/packages`: `gtk-build` over the packages (371,121,626 bytes, 1,655 s): fontconfig's
Meson found expat 2.8.5 and gperf, GTK's libtiff-4 4.7.2, libjpeg 3.2.0 and the five X libraries,
libepoxy Mesa's `egl.pc`; its check links and runs a GTK program.

Tested: its amy case (`demos/tools/test/amy-cases.json`, run alone with the other new packages' cases) passed in Chromium and Firefox (`work/packages-evidence-1117/runs/test-amy-new.log`).

Built in `work/packages`: `blender-deps` over the packages (460,838,815 bytes, 873 s): OpenColorIO found expat 2.8.5, OpenImageIO {fmt} 12.1.0, TIFF 4.7.2 and JPEG 62 (FindJPEG's `libjpeg.a`, as when the stage built libjpeg-turbo: OpenImageIO takes libjpeg-turbo's CMake config only for its shared `libjpeg-turbo::jpeg`), and the stage's embedded interpreter links and runs.

Built and tested in `work/packages`: `wine`, whose NetSurf compiles IJG's units from the pin now in `demos/wine`: `demos/wine/test/wine-browser.mjs` passed in Chromium and Firefox (NetSurf drew a JPEG; `test-wine.log`).

## Candidate

- Who installs it: GTK, Blender, libtiff, Pillow, Xonotic; sessions (`amy install libjpeg-turbo`).
- What the consumers lose: GTK's and Blender's CMake builds of it and their staging, and the
  `libjpeg` package with its Makefile and staging.
- Its own build: upstream's CMake, static, `WITH_SIMD=OFF` (x86 and Arm code).
- Verdict: done. Blender needs libjpeg-turbo (it takes `boolean` as an integer), so IJG's library
  could not be the one.
