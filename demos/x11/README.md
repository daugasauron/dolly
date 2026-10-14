# X11

The X Window System on Dolly's display: X.Org's server and clients, built
inside Dolly from their release archives, with programs in windows of their
own under a stock window manager.

## Images

- `x11-desktop`: an X session: the X server, twm, xclock, xeyes and xterm.
- `xorg-server`: Xsdl, the X server in Dolly's display, with xkbcomp and the keyboard descriptions.
- `twm`: twm, the Tab Window Manager.
- `xclock`: xclock, the Athena clock.
- `xeyes`: xeyes, the eyes that follow the pointer.
- `xterm`: xterm, the terminal emulator for X, with a shell on a pseudo-terminal.
- `x11-build`: A build stage: X's client libraries, from the protocol headers and libxcb to the Athena widgets, as static libraries.
- `xorg-server-build`: A build stage: the X server and its libraries, built by upstream's Meson where it has one.

Open `/x11-desktop/`; build with `npm run image -- x11-desktop`. The session
starts the server, twm, xclock, xeyes and xterm. Windows move by their title
bars; the keyboard goes to the window under the pointer.
`kill $(cat /tmp/.X0-pid)` in xterm ends the server, and the terminal's shell
is back.

## How it is built

- [`Dollyfile-x11-build`](Dollyfile-x11-build): xorgproto, xtrans, xcb-proto,
  libXau, libxcb, libX11, libXext, libXrender, libXfixes, libXi, libICE,
  libSM, libXt, libXmu, libXpm and libXaw, unchanged, by a Makefile that
  states what their configure scripts would find; xcb's protocol code is
  written by xcb-proto's generator in Dolly's Python. Static libraries and
  pkg-config files: `pkg-config --libs xaw7` names what to link, sockets@0's
  client (`-ldolly-sockets`) included.
- [`Dollyfile-xorg-server-build`](Dollyfile-xorg-server-build): pixman,
  libxkbfile, xkbcomp and xorg-server 21.1.25 by upstream's Meson, libmd's
  SHA-1 and libXfont2 (built-in fonts, PCF and BDF) by a Makefile,
  xkeyboard-config's evdev rules by its own generator.
- The server is Xsdl, the kdrive server in an SDL window, which xorg-server
  had until 2009 (commit 52bc6d94, "kdrive: Purge Xsdl"). [`xsdl/sdl.c`](xsdl/sdl.c)
  is that driver ported to SDL 2 and to today's kdrive, and
  [`xorg-server-xsdl.patch`](xorg-server-xsdl.patch) puts it back in the
  build as `-Dxsdl=true`. It knows nothing of Dolly: the `sdl2` package draws
  it into the display lease. The window's surface is the screen: damage is
  copied to it at most once every 16 ms, SDL's events are read when the
  server wakes, at least every 8 ms, and SDL's scancodes become the evdev
  keycodes of the default keymap (`us`, `pc105`).
- [`xorg-server-dolly.patch`](xorg-server-dolly.patch) (48 lines added, 7
  taken out): `Popen` and `Pclose`, with which the server runs xkbcomp for its
  keymap, use libc's `popen`, since Dolly has no `fork`; and the null
  functions the server installs as casts of `NoopDDA(void)` are functions of
  their pointers' types: WebAssembly traps on a call through a pointer of
  another signature (a pointer control, two colormap operations, a resource
  type, block and wakeup handlers).
- [`Dollyfile-xterm`](Dollyfile-xterm): xterm 412 over NetBSD's terminfo,
  without the Tektronix window, graphics or Xft. It runs in its own slave mode
  (`-S`): [`xterm-pty.c`](xterm-pty.c), installed as `xterm`, opens the
  pseudo-terminal, starts upstream's program (`/usr/libexec/xterm`) on the
  master and the shell, or the command after `-e`, on the slave.
  `select` is pselect's wait without a mask (Dolly's libc refuses `select`),
  and [`xterm-dolly.patch`](xterm-dolly.patch) (5 lines) skips the reset of
  ids xterm already has: Dolly refuses `setuid` and `setgid` even to them.

## Limits

- One screen of 1024x768, depth 24, which the page scales to the canvas. No
  GLX, DRI, MIT-SHM, XDMCP or TCP: clients connect at `/tmp/.X11-unix/X0`.
- Keys are keys: X maps them with its own US layout, whatever the page's
  layout types.
- Fonts are the server's built-in `fixed` and `cursor`; twm's Helvetica falls
  back to `fixed`.
- A program lives as long as the process that started it, so the session
  starts the clients: what twm's menu starts (`f.exec`) ends with the shell
  twm runs it in.
- Xlib has no locale data: clients say the locale is not supported and run in
  C, and xterm opens no input method.

Test: `node demos/x11/test/x11-browser.mjs [chromium|firefox ...]` ([`test/`](test/)).
