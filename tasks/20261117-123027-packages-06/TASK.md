# gtk-build builds gperf for fontconfig with a Makefile of its own

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: a `gperf` package (3.1, `DOLLY_GPERF_*` now in `demos/tools`) with GTK's
Makefile, its manual page and a check that a generated hash tells three keywords from a fourth word.
`gtk-build` installs it for fontconfig's build.

Built in `work/packages`: `gperf` (365,727 bytes; its check builds and runs a generated hash).

Built in `work/packages`: `gtk-build` over the packages (371,121,626 bytes, 1,655 s): fontconfig's
Meson found expat 2.8.5 and gperf, GTK's libtiff-4 4.7.2, libjpeg 3.2.0 and the five X libraries,
libepoxy Mesa's `egl.pc`; its check links and runs a GTK program.

Tested: its amy case (`demos/tools/test/amy-cases.json`, run alone with the other new packages'
cases) passed in Chromium and Firefox (`work/packages-evidence-1117/runs/test-amy-new.log`).

`ghostty-gtk`, the one program built on `gtk-build`, is the consumer with a browser test
(`demos/ghostty-gtk/test/`); it builds on Zig's chain (`zig-llvm`), which this tree does not build:
the next round builds it and runs that test.

## Candidate

- Who installs it: GTK's build; sessions, as yacc and flex are installed (`amy install gperf`).
  Wine's NetSurf runs the host's gperf while its sources are prepared, outside Dolly.
- What the consumers lose: gtk-build's 20-line Makefile and the archive's staging.
- Its own build: the Makefile (gperf 3.1 is the last release without gnulib's configure).
- Verdict: done.
