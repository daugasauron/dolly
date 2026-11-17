# A resize during a display lease can paint the lease's frame at the terminal's size

- STATUS: OPEN
- PRIORITY: 250
- TAGS: display,input,bug,0.1.8

Found on `fix/paste-touch` (2026-11-18), where the page's bar now comes below the canvas at a
finger's first lift, also while a program holds the display lease.

The terminal's driver keeps its layout current while a graphics lease suspends it, and its
`set_layout` (`programs/ghostty/display.c`) stores the new surface's geometry into the shared
mailbox's `frame_width`, `frame_height` and `frame_stride`. Those words also describe the frame
the lease published last (`display_present_packet`, `host/display/kernel.c`), and the page's
presenter reads them with the next frame sequence it sees. Where the resize comes between a
lease's present and the presenter's paint, the presenter paints the lease's buffer at the
terminal's size: one frame of the wrong shape, until the program presents again, and the pointer
is mapped onto that shape meanwhile (`framePoint` reads the canvas's size). `demos/fingers`
showed it: after the pinch's lift brought the bar, `__dolly.frame()` was 1280 by 755, the
terminal's new size, instead of fingers' 1256 by 780, in 2 of 6 runs; the next frame was right.
`dolly_display_acquire` reads the same words as the size a new lease starts at.

Do: give the terminal's geometry while suspended a place of its own (or let the kernel ask the
driver for it at acquire), so the words describe only the frame on screen. It is kernel and
display-plugin code: it needs a runtime build.

Done when a resize during a lease never paints a frame at another size than the lease's
(`demos/fingers/test/fingers-browser.mjs` no longer needs to wait for the program's own frame
after the lift).
