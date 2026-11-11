# The page's Paste button shows on laptops with a touchscreen

- STATUS: OPEN
- PRIORITY: 340
- TAGS: input,touch,npm,0.1.6

The owner, 2026-11-11 07:15 JST, from a page built on the npm packages:

> The Paste button shows up on some laptops, it's just wrong, I guess because the laptop has
> touch screen or something?

## State (2026-11-11)

Fixed on `fix/npm-feedback`: the bar shows Paste where `not (any-pointer: fine)` matches
(`host/input/input.mjs`). Chromium's emulation knows touch-only devices alone (Playwright's
`hasTouch` takes the fine pointer away too, and CDP's `setEmulatedMedia` ignores `pointer`);
Firefox emulates the laptop by its preferences (`ui.primaryPointerCapabilities` 1,
`ui.allPointerCapabilities` 7: a coarse primary pointer beside a fine one). The new case of
`test/touch-browser.mjs` failed in Firefox with the old rule (Paste shown) and passes with the
new; the test's phone cases still tap Paste, in Chrome and Firefox. On the 0.1.6 round's
catalog `test/touch-browser.mjs` passed in Chromium and Firefox, its laptop case included. Left:
the owner's phone. The release is served at `127.0.0.1:9045` (unit `dolly-serve-domain-9045`);
on 2026-11-12 at 01:05 the phone was asleep and locked, so it was not driven. `adb reverse
tcp:9045 tcp:9045` makes it `http://localhost:9045/v0.1.6/default/` on the phone.

Done when Paste is hidden in Chrome and Firefox with a fine pointer present, shown on a phone
(the owner's Mode1 over adb, `pi-phone`), and a browser test emulates both (Playwright's
`hasTouch` with and without a mouse; check that Chrome's emulation answers `any-pointer` as the
devices do before relying on it).
