# The page's Paste button shows on laptops with a touchscreen

- STATUS: CLOSED
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

## State (2026-11-20)

Fixed on `fix/paste-touch`, and for 0.1.8 on `fix/paste-touch-018`, merged into integrate/0.1.8
(`9e21be650`; there gpu@0's box, which fits its canvas to the frame, takes the frame's cell). The
0.1.8 round (018k, on 8d666a4e4) passed `test/touch-browser.mjs` in Chrome and Firefox (a coarse
pointer, the Pixel 7, and no Paste on a laptop beside a fine pointer) and, in its GPU stage,
`test/pointer-browser.mjs` in both (13 clicks on the pixels under them, on gpu@0's window and on
display@0's). On 2026-11-20 an Android emulator and a touchscreen laptop VM replaced the owner's
devices (below); they found that a phone with a stylus showed no Paste, fixed on
`fix/paste-devices`: Paste shows where no pointer hovers (`not (any-hover: hover)`).

**Paste.** The rule of 2026-11-11 (`fix/npm-feedback`, in v0.1.6 and v0.1.7) showed Paste where
`not (any-pointer: fine)` matches. That holds where the browser reports the touchpad beside the
touchscreen, as Firefox's source does on Windows and both browsers' emulations of such a laptop
do (Chromium's Blink settings `availablePointerTypes=6`, Firefox's `ui.allPointerCapabilities`
7): in Chrome's, main showed no Paste during the load, on the terminal or in an application.
Chrome on Windows answers a coarse pointer alone, as a phone does, for a laptop it takes for a
tablet: in Chromium's source, `ui::GetAvailablePointerAndHoverTypesImpl()` does so when
`base::win::IsDeviceUsedAsATablet()` holds, which a touchscreen beside a rotation sensor, a
laptop's power role and `SM_CONVERTIBLESLATEMODE` 0 make true (read, not seen on the owner's
laptop). Emulated so (`availablePointerTypes=2`; Firefox's `ui.allPointerCapabilities` 1), main
shows Paste from 1 s into the load, under the boot log, and on the terminal before the
application starts, also after the mouse has clicked.

**The pointer.** gpu@0's canvas lay over the whole element (`position:absolute; inset:0`), the
bar's strip included, while every pointer and finger record is mapped onto the display canvas's
box, which the bar shrinks. With Paste showing on that laptop, main fitted PhotoCraft's window
(photocraft-photos at 1600 by 900: a frame of 1600 by 856, taken beside the bar) into the whole
element, 22 px lower than the box the pointer was mapped onto: five clicks, each at a pixel the
window showed, landed 22 of its pixels below it, and one on the hex field's centre gave the
default cursor instead of the text one. On a Pixel 7, taps on a gpu@0 window landed 57 to 58
frame pixels (22 CSS px) low, on a display@0 window where they were made. The canvas also hid
the bar, Paste included, which still took presses.

**The fix.** input@0 shows Paste where no pointer is fine, once a finger has lifted and while no
mouse has moved on the page (a touchpad's pointer is a mouse's; a window that opens under it is
told so too), and changes the bar after the event's own handlers, so a press and its release
land in one layout (`host/input/input.mjs`). Dolly's element is a grid: the display's canvas and
gpu@0's share its first cell, the bar the second (`page/browser.mjs`, `host/gpu/gpu.mjs`), so
the one mapping, `framePoint` (`host/modules.mjs`), maps onto the box the frame is shown in.
Measured with it: on the laptop called a tablet no Paste, PhotoCraft's frame 1600 by 900 and
five clicks on the pixels under them (the hex field's gave the text cursor); on a touch tablet of
that size the first tap brings the bar, the window is fitted above it and taps land on the
pixels under them; on the Pixel 7 taps on gpu@0 and display@0 windows too.

Evidence (Chrome 156, Firefox 159; gpu@0 on the NVIDIA adapter), on `fix/paste-touch` and again
on `fix/paste-touch-018` (2026-11-18):
- `test/touch-browser.mjs` passes in both: on a coarse pointer alone (`hasTouch`, and the
  Pixel 7) no Paste before a finger has lifted, then Paste, which reads the clipboard, and none
  once the mouse has clicked; on both laptops none from the load through the shell, a finger,
  the mouse and an application's buttons in the bar.
- `test/pointer-browser.mjs` (new, hardware: a program of `test/fixtures/pointer.c` holding
  the leases, its frame of the size the surface had at the start, as PhotoCraft's) passes in
  Chrome and Firefox: on gpu@0's window and on display@0's, 13 clicks each land
  on the frame's pixel under them, before, at once after and a second after the program's
  button brings the bar, and then the window narrowing.
- `demos/photocraft/test/photocraft-touch-browser.mjs` (new) passes in Chrome: on a touchscreen
  with no fine pointer (900 by 900) no Paste before a finger, a tap on the hex field focuses it
  before the bar, and one on the red field after it (their Ctrl+C gives 000000, then 0). Firefox
  through WebDriver BiDi, which drives the installed Firefox, gets no touch from Playwright (a
  `hasTouch` page there reports a fine pointer and taps reach it as nothing), so there the bar
  over gpu@0 is the pointer test's. A window under the X server's resting pointer is told a mouse
  is over it at once, as a laptop's: the test's page keeps narrower than half the display.
- `display`, `terminal` and `display-cursor` browser tests and `demos/fingers` pass in both;
  fingers reads the canvas's box at each touch, since the bar now comes after its first lift
  (its test of main fails on this), and waits for its own frame after the lift: a resize during
  a lease can paint one frame at the terminal's size (tasks/20261118-002000-lease-frame-geometry).

## Real input stacks (2026-11-20)

The owner, 2026-11-20, asked not to use their Mode1 phone or their laptop: "Can you find some
other way to test it properly?" So an Android emulator stands for the phone and a KVM guest with
a touchscreen for the laptop; Dolly is RC1 (`282bc58c4`, `127.0.0.1:9045/v0.1.8/`), each page on
`http://localhost` (adb reverse, ssh -R). Lab scripts and evidence: `work/touch-lab/`
(`scripts/`, `evidence/`, `logs/`).

**Phone.** Emulator 37.3.10, Android 17 (`system-images;android-37.0;google_apis;x86_64` r08),
headless on KVM: its Chrome 145.0.7632.218 and Firefox 160.0.1 (Fenix x86_64 from
archive.mozilla.org; Marionette). The emulator's own touchscreens report `BTN_TOOL_RUBBER` and
`BTN_STYLUS`, so Android gives them a stylus source; with them off (`-feature -VirtioInput`) a
touchscreen made in the guest by Android's `uinput` (multitouch axes, `BTN_TOUCH`,
`INPUT_PROP_DIRECT`) is a plain phone's, and its fingers take the kernel, InputReader and browser
path. The clipboard was set from the emulator side (its gRPC `setClipboard`).
- Plain phone, both browsers: `pointer` coarse, `any-pointer` coarse, `hover` none, `any-hover`
  none. Paste stayed hidden through the load and while a finger was down, showed once it lifted;
  a tap read the clipboard (Chrome asked Allow once per origin, Firefox showed its Paste chip),
  the text reached the prompt and the keyboard's Enter ran it (`evidence/phone-{chrome,firefox}`).
- Taps (`fixtures/taps.c`, compiled in the phone's browser): a finger as the pointer, and as
  touch@0's, 13 each, before and after the bar and after turning to landscape, on display@0's
  frame pixel under it (within 1) in both browsers, and three times more each on the same code;
  neither browser had a WebGPU adapter, so no gpu@0 there. Where a tap was aimed while the
  keyboard was closing, the finger landed beside the frame and the program read its edge.
- With the stylus touchscreens: Chrome `any-pointer` coarse and fine, Firefox the same (fine
  alone with only the stylus screens), `any-hover` none in both, and RC1 never showed Paste after
  a finger (`evidence/phone-*-stylus`): such a phone has no paste chord either. With the fix,
  served from `fix/paste-devices`, Paste showed and pasted in both browsers, on the stylus phone
  and on the plain one (`evidence/phone-*-stylus-fix`, `phone-*-fix`).

**Laptop.** QEMU 11.1.3 (download.qemu.org) on KVM: Ubuntu 26.04 cloud image (kernel 7.0),
virtio-vga at 1920 by 1080, `virtio-multitouch-pci` bound to the display beside a relative
`virtio-mouse-pci` and a keyboard, no PS/2; touches, moves and clicks through QMP
`input-send-event`. Google Chrome 158.0.8127.36 (dl.google.com) and Firefox 160.0.1
(archive.mozilla.org), on Xorg with libinput (no window manager) and on Weston 14's kiosk shell.
- Chrome: `pointer` fine, `any-pointer` coarse and fine, `hover` hover, `any-hover` hover
  (X11 and Wayland). Firefox: `pointer` fine, `any-pointer` fine, `hover` hover, `any-hover`
  hover (both); on X11 it gets no touch events, a finger is its mouse; on Wayland, touch.
- Paste never showed, sampled four times a second and every frame: through the load, a finger,
  the mouse, a finger again and the shell, in both browsers on both display servers, on RC1 and
  on the fix; and through photocraft-photos' load and terminal on RC1.
- Clicks and fingers (`taps.c` on RC1, X11): Chrome display@0, a finger 7 and the mouse 7 before
  and after the window narrows, and 13 fingers as touch@0's; Firefox display@0 and gpu@0 (its
  fallback adapter with `dom.webgpu.enabled`), a finger 7 and the mouse 7 each: every one on the
  frame pixel under it. Chrome has no adapter there; with `--enable-unsafe-webgpu` SwiftShader
  loses its device on a canvas ("Device was destroyed", a plain WebGPU page too), so no gpu@0.
- PhotoCraft did not start in the VM, in either browser, with or without WebGPU, at 4 or 8
  vCPUs: it quit on winit's "input thread: Resource temporarily unavailable (os error 6)", its
  brush presets failing alike (`evidence/laptop-*-x11-webgpu`); headless Chrome 156 on the host
  starts it. So PhotoCraft's own fields were not clicked there; `taps.c` stands for it.
- Windows' tablet heuristic stays the emulation's (`called a tablet` below).

**The fix.** A stylus is a fine pointer that does not hover, and a laptop's touchpad hovers in
every browser measured, so Paste now shows where `not (any-hover: hover)` matches
(`host/input/input.mjs`, `docs/input.md`). `test/touch-browser.mjs` adds a phone with a stylus
(Blink settings pointers 6, hovers 1; Firefox's capabilities 2) and checks the laptops' hover;
it passed in Chromium and Firefox, and its new case fails with the old rule.
`test/pointer-browser.mjs` passed in both (13 clicks each on gpu@0 and display@0, on Xvfb with
the NVIDIA adapter).

Done when Paste is hidden on a laptop with a touchscreen in Chrome and Firefox, shown on a phone
once a finger has lifted, clicks land where they are made on both, and the browser tests emulate
them. The owner, 2026-11-20, replaced their Mode1 phone and their laptop by other real input
stacks: the Android emulator's Chrome and Firefox, and Chrome and Firefox in a KVM guest with a
touchscreen and a mouse (above).

## Closed (2026-11-20)

On `fix/paste-devices`: the emulator's phone showed Paste, read the clipboard and took taps on
the pixels under them in Chrome 145 and Firefox 160; the VM's laptop never showed Paste and took
clicks and fingers on the pixels under them in Chrome 158 and Firefox 160; `test/touch-browser.mjs`
and `test/pointer-browser.mjs` passed in Chromium and Firefox.
