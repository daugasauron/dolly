# Ghostty's GTK application: GModule criticals at start, a missing icon, text shaded a pixel at a time

- STATUS: OPEN
- PRIORITY: 180
- TAGS: x11,ghostty,terminal

Left by `20261112-223154-x11-workbench` (2026-11-13), which made `ghostty` start with nothing
set and draw only what changed.

## State (2026-11-19)

Not done for 0.1.8 (the task has no release tag; `fix/rc-recipes` took the tagged ones first). What
each part needs, found 2026-11-19:

- The criticals are a seed change. Ghostty is linked without `-rdynamic`, so its `dlopen` is the
  process library's weak refusal (`process/libc-adapter.c`, `dolly_dlopen`: `ENOSYS` for every
  path, `NULL` among them); and it uses threads@0, where dso@0 refuses `DOLLY_DSO_OPEN` in a
  program that hosts no libraries (`host/dso/process.mjs`, `callsOnly`). The fix: that weak
  `dolly_dlopen(NULL, …)` returns a handle for the program, whose symbols a program without
  `-rdynamic` does not export by name (as an ELF executable's are not in its dynamic table), so
  `dolly_dlsym` on it fails with "undefined symbol" and `dolly_dlclose` succeeds; the same in
  `process/libc-stubs.c`'s `dlopen`. It needs a seed round and a test in `test/dso-browser.mjs`
  (a program built without `-rdynamic`).
- The icon: `tab-new-symbolic` is the Adwaita icon theme's; a package of its symbolic icons
  (a new upstream source) that `ghostty-gtk` installs.
- Softpipe: a measurement only.

- GTK prints three GModule criticals as it starts: `_gtk_module_has_mixed_deps` opens the
  program itself (`g_module_open(NULL, 0)`) and `dlopen(NULL)` fails in Dolly, where POSIX gives
  a handle for the running program. The dso@0 client is in the seed: for a seed round.
- The new-tab button shows GTK's missing-image icon: `tab-new-symbolic` is the Adwaita icon
  theme's, which no package carries.
- Softpipe shades a glyph's pixels in its interpreter, about 1.4 µs each: a whole redraw of a
  102x37 window full of text takes 0.4 s (a scroll in Neovim), where a changed row takes 0.15 s
  with everything else (`demos/ghostty-gtk/README.md`, Softpipe).

## Done when

`ghostty &` in `x11-desktop` prints no GLib critical, its header bar shows its icons, and a
scroll of a full window of text is measured again.
