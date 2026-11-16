# X11's client libraries are in no package: x11-window and libxkbfile cannot be used in a session, photocraft ships libX11 copied for its link

- STATUS: OPEN
- PRIORITY: 240
- TAGS: audit,recipes,amy,x11,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Fixed in source on `fix/amy` (`work/fix-amy`, commit `183b064ef`), pins refreshed:
- `demos/x11/Dollyfile-x11-libs`, a new package FROM x11-build: X's client libraries as x11-build
  builds them, Xlib, libxcb and libXau to the Athena widgets (the whole stack, so that each header
  has its library and a session can build an Xt program too), static, with `/usr/include/X11` and
  `/usr/include/xcb`, their `.pc` files and xorgproto's, XErrorDB and the licences (462 files,
  7.2 MB); it REQUIRES HOST sockets@0 and INSTALLs libdolly-sockets, which xcb.pc links.
  `demos/x11/README.md` describes it.
- `x11-window` INSTALLs x11-libs and libdolly-input (was USE); `libxkbfile` INSTALLs x11-libs and
  declares sockets@0, as an INSTALL of it must; `photocraft` USEs x11-libs and drops its six COPY
  rows. It keeps the three licence FOLDER rows: its binary links those libraries, so it carries their
  notices (from x11-libs now), as Godot carries mesa's.

By the audit's method on round1113's dist, the package's files stood in for by an archive of them
read from x11-build's snapshot (`fix-amy/scripts/x11-libs-tar.mjs`): in a fresh default session
`amy install x11-window libdolly-input libdolly-sockets cc` and the archive, then a program calling
`x11_window_open` links with `-lx11-window -lX11 -lxcb -lXau -ldolly-sockets` and gets ENOENT;
`amy install libxkbfile libdolly-sockets cc pkgconf` and the archive, then a program including
`stdio.h`, `X11/XKBlib.h` and `X11/extensions/XKBfile.h` (its users include the first two; the
audit's probe without them cannot compile) builds with `pkg-config --cflags --static --libs xkbfile`;
Chromium and Firefox (`fix-amy/byhand-*.jsonl`, cases `x11-window-fixed`, `libxkbfile-fixed`).

Waits for the round: x11-libs is a new image; x11-window, libxkbfile, xkbcomp, xorg-server,
photocraft, photocraft-photos, the Godot images and x11-desktop rebuild. Then the x11-window session
of `test/amy-browser.mjs` confirms the first Done-when item (it fails on today's image), the
libxkbfile probe above the second, and `amy files photocraft` must list no `libX11.a`.

## Found

Xlib, libxcb, libXau and the X.Org protocol headers exist only in the toolchains `x11-build`,
`mesa-build` and `gtk-build` (`/usr/include/X11/Xlib.h` is in no package's snapshot). Two packages
of amy's index are built over them and name none of it:

- `x11-window` (`demos/x11/Dollyfile-x11-window`, `FROM x11-build`, `USE` libdolly-display and
  libdolly-input). Its header includes `<dolly/input.h>`; its `x11-window.c` calls Xlib. In a session,
  with `amy install x11-window libdolly-input cc`:
  ```
  $ cc -O0 /tmp/xw.c -lx11-window -o /tmp/xw      # calls x11_window_open
  wasm-ld: error: /usr/lib/libx11-window.a(x11-window.o): undefined symbol: XOpenDisplay
  ... XCreateSimpleWindow, XSelectInput, XInternAtom, XMapWindow, XFlush (15 errors)
  ```
  and without `libdolly-input`: `/usr/include/x11-window.h:12:10: fatal error: 'dolly/input.h' file not found`.
- `libxkbfile` (`Dollyfile-libxkbfile`, `FROM x11-build`): `xkbfile.pc` says `Requires: kbproto`
  and `Requires.private: x11`; `XKBfile.h` uses Xlib's `Display`, `Atom` and `Status` (its users
  include `X11/Xlib.h` first) and `XKMformat.h` includes `X11/extensions/XKB.h` and `XKBproto.h`;
  none of them is in any package. `pkg-config --cflags --static --libs xkbfile`:
  `Package 'kbproto', required by 'xkbfile', not found`.

PhotoCraft links `x11-window` and so copies the three libraries out of `x11-build` itself
(`demos/photocraft/Dollyfile-photocraft:28-34`, "The X client libraries x11-window links, for the
link alone, and their licences"). A package keeps its `COPY` results (`docs/dollyfile.md`), so every
`amy install photocraft` writes them into the session: `amy files photocraft` lists
`/usr/lib/libX11.a` (1,605,928 bytes), `libxcb.a` (177,478), `libXau.a` (10,274) and their three
licences, which nothing in the session links. Docs: "The same `COPY` rows in two recipes are a
missing package"; Godot gets the same libraries from its base, `mesa-build`.

Evidence: `work/audit-1116-evidence/recipes/run-a.jsonl`/`run-b.jsonl` (cases `x11-window`,
`libxkbfile`), `debug2.jsonl` (`x11-window-link`, `photocraft-files`, `libxkbfile-files`),
`header-needs.txt` (every package header's `#include` checked against the package's install closure).

## Do

A package of X's client side from `x11-build` (Xlib, libxcb, libXau, their headers and
`xorgproto`'s headers and `.pc` files, with licences), which `x11-window` and `libxkbfile`
`INSTALL`, and `x11-window` also `INSTALL`s `libdolly-input` instead of `USE`. PhotoCraft then
drops its six `COPY` rows and three `FOLDER` rows and `USE`s that package for its link.

## Done when

In a fresh `default` session, `amy install x11-window cc` links a program calling
`x11_window_open`, and `amy install libxkbfile cc pkgconf` compiles one including
`X11/extensions/XKBfile.h` with `pkg-config --cflags --static --libs xkbfile`; `amy files photocraft`
lists no `libX11.a`.
