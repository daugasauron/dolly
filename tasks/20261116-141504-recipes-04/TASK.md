# X11's client libraries are in no package: x11-window and libxkbfile cannot be used in a session, photocraft ships libX11 copied for its link

- STATUS: OPEN
- PRIORITY: 240
- TAGS: audit,recipes,amy,x11,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Merged into `integrate/0.1.8` (02b7ba436). Built on `ws/recipes` (`work/recipes`): x11-libs (a new
image, 7,513,119 bytes), x11-window, libxkbfile, xkbcomp, xorg-server and x11-desktop. Two of the
three Done-when items pass in Chromium and Firefox:

- `amy install x11-window` in a fresh `default`, then cc: `test/amy-browser.mjs`'s x11-window
  session (a program calling `x11_window_open` links and runs) passed (`logs/a-programs.log`).
- `amy install libxkbfile cc pkgconf`: a program including `stdio.h`, `X11/XKBlib.h` and
  `X11/extensions/XKBfile.h` built with `pkg-config --cflags --static --libs xkbfile` and ran;
  amy installed libdolly-sockets and x11-libs first and had nena enable `sockets@0` (case
  `libxkbfile-alone`, `logs/cases-*.jsonl`).
- `demos/x11/test/x11-browser.mjs` passed on the rebuilt x11-desktop in both (`logs/a-x11.log`).

Paths under `work/audit-1116-evidence/recipes/ws-recipes/`. Left for the 0.1.8 round: photocraft is
built on the Rust chain, which this tree does not rebuild; once it is, `amy files photocraft`
must list no `/usr/lib/libX11.a` (the regenerated overlaps of this tree still show photocraft's
0.1.7 snapshot holding libX11.a, libxcb.a and libXau.a beside x11-libs,
`logs/overlaps-1.txt`). Rebuilds x11-libs, x11-window, libxkbfile, xkbcomp, xorg-server,
photocraft, photocraft-photos, the Godot images and x11-desktop.

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
