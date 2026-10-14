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

Test: `node demos/x11/test/x11-browser.mjs` ([`test/`](test/)).
