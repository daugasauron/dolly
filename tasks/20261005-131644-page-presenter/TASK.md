# Page presenter allocates 14 MB per frame, never idles and drops input silently

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,display,performance,observability

Static reading of `host/display/display.mjs` at release `223b8f9e…` plus
in-sandbox measurements (`~/Downloads/AUDIT-browser-runtime.md` §1-§7, `~/Downloads/AUDIT-session-latency.md` §4): 75 fps with 28-42 ms gaps.

- `FramebufferPresenter.paint()` copies each frame twice and allocates both
  copies: about 13.7 MiB per frame at 1850x968.
- Three `dataset` writes on `<html>` per painted frame, changed or not.
- The animation-frame loop never parks; `updateCursor()` touches the DOM every frame.
- `pushRecord()` encodes three strings per input record; pointer motion is one
  record per event into the 256-record ring, which drops records, keys
  included, without a counter or a signal.
- The canvas backing store is reallocated whenever a program changes its size.
- Nothing reports page memory, copies, drops or frame timing.

## Work

Measure first, on the page: allocation per frame and long frames for an idle
terminal and for a full-screen animation, in Chrome and Firefox. Record the
baseline here. Then fix what the numbers confirm: one copy and no allocation
per frame, writes only on change, a parked loop, motion coalesced per frame,
and a stated overflow rule under which a key is never lost silently. Counters
only where a test or a program reads them.

The input split (`20261002-072000-input-host-module`) will move
`host/display/input.mjs`; shape the ring work so it carries over, and do not
start the split here.

## Done when

- Baseline and result are recorded here.
- A browser test fails if a key record is dropped silently.
- Terminal, display and game tests pass in Chrome and Firefox.
