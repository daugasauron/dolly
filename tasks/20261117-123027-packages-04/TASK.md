# GTK and Blender each build expat, at 2.8.5 and 2.7.5

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: an `expat` package (2.8.5, GTK's pin, `DOLLY_EXPAT_*` now in
`demos/tools`) by its CMake, with Blender's two `-D` renames of internal names: CPython's own expat
(in libpython's companions, `packages-10`) renames the API by `pyexpatns.h` and not those two, so a
program that embeds Python and links expat holds both. `gtk-build` (fontconfig) and `blender-deps`
(OpenColorIO) install it; the package keeps expat's CMake files, which OpenColorIO looks for first.

Built in `work/packages`: `expat` (408,168 bytes).

Built in `work/packages`: `gtk-build` over the packages (371,121,626 bytes, 1,655 s): fontconfig's
Meson found expat 2.8.5 and gperf, GTK's libtiff-4 4.7.2, libjpeg 3.2.0 and the five X libraries,
libepoxy Mesa's `egl.pc`; its check links and runs a GTK program.

Tested: its amy case (`demos/tools/test/amy-cases.json`, run alone with the other new packages' cases) passed in Chromium and Firefox (`work/packages-evidence-1117/runs/test-amy-new.log`).

Built in `work/packages`: `blender-deps` over the packages (460,838,815 bytes, 873 s): OpenColorIO found expat 2.8.5, OpenImageIO {fmt} 12.1.0, TIFF 4.7.2 and JPEG 62 (FindJPEG's `libjpeg.a`, as when the stage built libjpeg-turbo: OpenImageIO takes libjpeg-turbo's CMake config only for its shared `libjpeg-turbo::jpeg`), and the stage's embedded interpreter links and runs.

Found in `work/packages`: Blender's link over the expat package failed, `duplicate symbol: XML_SetHashSalt16Bytes`, defined in `libpyexpat.a(xmlparse.o)` and `libexpat.a(xmlparse.c.o)`. CPython 3.14 bundles expat 2.8.2, whose `XML_SetHashSalt16Bytes` its `pyexpatns.h` does not rename; Blender's own 2.7.5 had no such function. The python package's build now renames it as the header renames the rest (`PY_CPPFLAGS`), and blender-deps' check links the expat package beside the interpreter, as Blender does, so that it fails there rather than after Blender's hour of compiling.

Built in `work/packages`: `python` with the rename (50,245,335 bytes) and `blender-deps` over it: the check now links the expat package beside libpython and `libpyexpat.a` (`XML_ParserCreate` of the one, `import pyexpat` of the other) and runs.

## Candidate

- Who installs it: GTK, Blender; sessions.
- What the consumers lose: a CMake build each and their staging.
- Its own build: upstream's CMake, static, without tools, examples, tests and documentation.
- Verdict: done. Wine's GIMP keeps its expat 2.7.1, compiled into its Winelib module
  (`packages-00`).
