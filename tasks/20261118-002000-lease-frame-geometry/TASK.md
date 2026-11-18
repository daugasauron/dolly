# A resize during a display lease can paint the lease's frame at the terminal's size

- STATUS: OPEN
- PRIORITY: 250
- TAGS: display,input,bug,0.1.8

## State (2026-11-18, the compiler batch)

Fixed on `fix/compiler-batch`, for the round to confirm with `fix/paste-touch-018`'s fingers test.
The words describe only the frame on screen: the driver's `set_layout` no longer writes them
(its `render_frame` publishes the terminal's geometry with the terminal's frame, as the kernel's
present publishes a lease's with the lease's), and `dolly_display_acquire` draws the terminal's
pending frame (`driver->present()`, after `apply_surface()`) before it reads them, so a lease
starts at the size of the frame on screen: the terminal's for the page's surface now, or, nested,
the lease's it takes over. The page's presenter (`host/display/display.mjs`) paints nothing
before the first frame is published: it read the words at sequence 0 too, which the driver
filled at its initialization and now does not (`default` failed to boot with "Dolly published
an invalid framebuffer" until it waited). No contract changes: the driver's table and the
mailbox's layout are as they were.

Proof, a probe in `system` (`build/agent/lease-probe.mjs` of `work/compiler`, not committed): a
program acquires the display (1280 by 800) and presents 600 frames, one an animation frame, while
the page is resized 40 times between 1280 by 720 and 1180 by 680, the painted frame
(`__dolly.frame()`) sampled 8 times after each. On 0.1.8's integration runtime, 18 of 320 samples
in Chromium and 18 in Firefox were the terminal's size; with the change (its runtime and images
rebuilt), none in either: all 320 were the lease's.

On that seed `test/display-`, `display-cursor-`, `terminal-`, `pager-`, `touch-`, `theme-`,
`indicators-` and `process-browser.mjs` pass in Chromium and Firefox.

The round confirms: the runtime and every image with the plugin rebuilt
(`ghostty-build`, `display` and above), `test/display-browser.mjs` and the GPU and display
tests, and `demos/fingers/test/fingers-browser.mjs` (on `fix/paste-touch-018`) with its wait for
the program's own frame after the lift removed.

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
