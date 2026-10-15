# GTK

GTK 4 and the libraries it is built on, on the way to Ghostty's GTK window on
Dolly's X server ([`x11`](../x11/README.md)). Each is built inside Dolly from a pinned
upstream release.

## Images

- `pcre2`: PCRE2's 8-bit library, GLib's regular expressions.
- `glib`: GLib, GObject and GIO, with their tools.
- `gtk-build`: A build stage: GTK 4 with its X11 backend and the libraries under it (FreeType, FriBidi, HarfBuzz, fontconfig, cairo, pango, gdk-pixbuf, graphene, libepoxy and the rest), as static libraries.

## Use

A GObject program is linked as usual; GObject's `pkg-config` file adds
`--dolly-cast-emulation`, with which `cc` passes the program through Binaryen's
cast emulation (the `binaryen` package of [`tools`](../tools/README.md)):

    cc -pthread prog.c -o prog $(pkg-config --cflags --libs gio-2.0)

GObject calls functions through pointers cast to types of other parameters
(a `G_DEFINE_TYPE` class's init functions, a handler of fewer parameters than
its signal passes, `g_list_sort`), which traps in WebAssembly. The pass makes
every indirect call go through one signature, and `dso@0`'s FFI calls such a
program in it. A GLib program is threaded (`threads@0`) and records `dso@0`
for libffi.

## Key files

- [`Dollyfile-glib`](Dollyfile-glib), [`glib-dolly.patch`](glib-dolly.patch):
  upstream's Meson build; the patch makes `g_unix_fd_query_path` say it is not
  supported here, as on Hurd, where upstream stops with an `#error`.
- [`Dollyfile-pcre2`](Dollyfile-pcre2): PCRE2 from its generic configuration.
- [`Dollyfile-gtk-build`](Dollyfile-gtk-build): each library by its own Meson or
  CMake build; gperf 3.1 (fontconfig's build runs it) and the X extension
  libraries GTK links beyond `x11-build`'s by this recipe's Makefile and script.
  Two patches: [`fontconfig-dolly.patch`](fontconfig-dolly.patch) names Dolly
  in `fcstat.c`'s list of systems whose `statfs` it reads, where upstream stops
  with an `#error`; [`gtk-dolly.patch`](gtk-dolly.patch) builds GTK's library
  as the build's default library asks, static here, where upstream always
  builds it shared (a threaded program loads no library).
