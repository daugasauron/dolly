# GTK and Blender each build libtiff, at 4.7.2 and 4.7.1 with the same options

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: a `libtiff` package (4.7.2, GTK's pin, `DOLLY_LIBTIFF_*` now in
`demos/tools`), by its CMake with zlib and the `libjpeg-turbo` package and the codecs both builds
left off (libdeflate, LZMA, zstd, WebP, JBIG, LERC); the recipe checks that `tiffconf.h` has
`JPEG_SUPPORT`. `gtk-build` and `blender-deps` install it.

Built in `work/packages`: `libtiff` (961,847 bytes; CMake: "Found JPEG: /usr/lib/libjpeg.a (found
version "62")").

Built in `work/packages`: `gtk-build` over the packages (371,121,626 bytes, 1,655 s): fontconfig's
Meson found expat 2.8.5 and gperf, GTK's libtiff-4 4.7.2, libjpeg 3.2.0 and the five X libraries,
libepoxy Mesa's `egl.pc`; its check links and runs a GTK program.

Tested: its amy case (`demos/tools/test/amy-cases.json`, run alone with the other new packages' cases) passed in Chromium and Firefox (`work/packages-evidence-1117/runs/test-amy-new.log`).

Built in `work/packages`: `blender-deps` over the packages (460,838,815 bytes, 873 s): OpenColorIO found expat 2.8.5, OpenImageIO {fmt} 12.1.0, TIFF 4.7.2 and JPEG 62 (by FindJPEG: the libjpeg-turbo package keeps no CMake config, which OpenImageIO tries first), and the stage's embedded interpreter links and runs.

## Candidate

- Who installs it: GTK (its texture loader), Blender (OpenImageIO); sessions.
- What the consumers lose: a CMake build each, and GTK's and Blender's staging of the archive.
- Its own build: upstream's CMake, static, without its tools, tests and documentation.
- Verdict: done.
