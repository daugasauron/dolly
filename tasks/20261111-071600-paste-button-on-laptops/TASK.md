# The page's Paste button shows on laptops with a touchscreen

- STATUS: OPEN
- PRIORITY: 340
- TAGS: input,touch,npm,0.1.8

The owner, 2026-11-11 07:15 JST, from a page built on the npm packages:

> The Paste button shows up on some laptops, it's just wrong, I guess because the laptop has
> touch screen or something?

and on 2026-11-17 at 21:00, on v0.1.7:

> Another thing I noticed is that there is still weird "paste button" behaviour when using a
> laptop that has touch screen. I think I saw it like during the load (before app launch) and
> also the mouse position (clicks etc) after loading photocraft got distorted. I have a feeling
> the mouse inaccuracy is related to teh Paste button showing.

## State (2026-11-17)

Fixed on `fix/paste-touch` for 0.1.8. Left: the owner's laptop and phone.

The rule of 2026-11-11 (`fix/npm-feedback`, in v0.1.6 and v0.1.7) showed Paste where
`not (any-pointer: fine)` matches. That holds where the browser reports the touchpad beside the
touchscreen, as Firefox's source does on Windows and both browsers' emulations of such a laptop
do (Chromium's Blink settings `availablePointerTypes=6`, Firefox's `ui.allPointerCapabilities`
7): in Chrome's, main showed no Paste during the load, on the terminal or in an application.
Chrome on Windows
answers a coarse pointer alone, as a phone does, for a laptop it takes for a tablet: in
Chromium's source, `ui::GetAvailablePointerAndHoverTypesImpl()` does so when
`base::win::IsDeviceUsedAsATablet()` holds, which a touchscreen beside a rotation sensor, a
laptop's power role and `SM_CONVERTIBLESLATEMODE` 0 make true (read, not seen on the owner's
laptop). Emulated so (`availablePointerTypes=2`; Firefox's `ui.allPointerCapabilities` 1), main
shows Paste from 1 s into the load, under the boot log, and on the terminal before the
application starts, also after the mouse has clicked.

Now input@0 shows Paste where no pointer is fine, once a finger has lifted and while no mouse
has moved on the page (a touchpad's pointer is a mouse's), and changes the bar after the
event's own handlers, so a press and its release land in one layout (`host/input/input.mjs`).
`test/touch-browser.mjs` passes in Chrome 156 and Firefox 159: on a coarse pointer alone
(`hasTouch`, and the Pixel 7) no Paste before a finger has lifted, then Paste, which reads the
clipboard, and none once the mouse has clicked; on both laptops none from the load through the
shell, a finger, the mouse and an application's buttons in the bar. `demos/fingers` reads the
canvas's box at each touch, since the bar now comes after its first.

Done when Paste is hidden on a laptop with a touchscreen in Chrome and Firefox, shown on a phone
(the owner's Mode1 over adb, `pi-phone`, once a finger has lifted), and a browser test emulates
both.
