# Page providers: console backpressure, html limits, packages quota, display frame, session wording, review map

- STATUS: OPEN
- PRIORITY: 240
- TAGS: host-modules,security,docs,browser-boundary,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, S4, S6, S7, S8, section 6 items 1-3, 2026-11-07 F15).

## State (2026-11-12)

Filed.

## Do

- `console@0`: the Worker stops reading a console while more than a few MiB are unacknowledged
  (`host/console/console.mjs:34,46,66-72`); the page queue is bounded.
- `html@0`: a submission over 64 KiB says so instead of nothing (`host/html/html.mjs:121`); the quiet
  period follows a submit too (`:219`); measure autofill offers on `email`/`tel`/`cc-number`
  fields in Chromium and Firefox.
- `packages@0`: count a served package on success, not before it is found
  (`host/packages/service.mjs:59-60`).
- `display@0`: check each frame dimension, not only `stride * height` (`host/display/display.mjs:263-266`).
- Sessions: the custom-image check proves the file is self-consistent, not where it came from;
  reword `host/snapshot/snapshot.mjs:32-36` and `docs/sessions.md:55-59`; the sessions page's Import
  names the modules an imported save will have.
- `docs/browser-boundary.md`: `src/route.mjs` in "Trusted files"; `console@0` in the diagram.

## Done when

Each is in with a test where it changes behaviour (console, html, packages, display), and the review
map matches the code.
