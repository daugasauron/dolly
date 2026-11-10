# The page's Paste button shows on laptops with a touchscreen

- STATUS: OPEN
- PRIORITY: 340
- TAGS: input,touch,npm,0.1.6

The owner, 2026-11-11 07:15 JST, from a page built on the npm packages:

> The Paste button shows up on some laptops, it's just wrong, I guess because the laptop has
> touch screen or something?

## State (2026-11-11)

Found, not fixed. input@0's bar shows Paste when `matchMedia("(pointer: coarse)")` matches
(`host/input/input.mjs`, `showBar`): the rule means "a touchscreen, which has no paste chord".
That query asks about the *primary* pointer only, and a laptop with a touchscreen may report its
touchscreen as primary although it has a keyboard and a touchpad, so the bar appears with Paste on
a machine where Ctrl+V works.

What the button is for: a device with no keyboard, where nothing can send the paste chord (a
phone or a tablet). The nearest thing a page can ask is whether any pointer is fine:
`(any-pointer: fine)` matches with a touchpad or mouse. Show Paste only when it does not match;
the bar's own `display` follows the same rule.

Done when Paste is hidden in Chrome and Firefox with a fine pointer present, shown on a phone
(the owner's Mode1 over adb, `pi-phone`), and a browser test emulates both (Playwright's
`hasTouch` with and without a mouse; check that Chrome's emulation answers `any-pointer` as the
devices do before relying on it).
