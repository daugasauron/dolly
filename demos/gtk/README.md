# GTK

The libraries GTK is built on, on the way to Ghostty's GTK window on Dolly's
X server ([`x11`](../x11/README.md)). Each is built inside Dolly from a pinned
upstream release.

## Images

- `pcre2`: PCRE2's 8-bit library, GLib's regular expressions.
- `glib`: GLib, GObject and GIO, with their tools.

## Use

A GObject program is linked as usual and then passed through Binaryen's cast
emulation (the `binaryen` package of [`tools`](../tools/README.md)):

    cc -pthread prog.c -o prog $(pkg-config --cflags --libs gio-2.0)
    wasm-opt --fpcast-emu prog -o prog

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
