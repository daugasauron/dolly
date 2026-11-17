# ghostty-gtk unpacks GTK's release archive again for the settings schemas GTK's install writes

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: `gtk-build` keeps `/usr/share/glib-2.0/schemas`, where GTK's Meson install
writes its five schemas and compiles them; `ghostty-gtk` compiles that folder (`--strict`) and no
longer reads `gtk/gtk-4.24.1.tar.xz` (17 MB) a second time.

Built in `work/packages`: `gtk-build` over the packages (371,121,626 bytes, 1,655 s): fontconfig's
Meson found expat 2.8.5 and gperf, GTK's libtiff-4 4.7.2, libjpeg 3.2.0 and the five X libraries,
libepoxy Mesa's `egl.pc`; its check links and runs a GTK program. Its snapshot holds the five schemas and `gschemas.compiled`.

## Candidate

- Who installs it: programs built on gtk-build (Ghostty's GTK application).
- What the consumers lose: a second unpacking of GTK's archive.
- Its own build: GTK's, unchanged.
- Verdict: done.
