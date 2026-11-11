# Interrupting a Pi agent no longer cancels its model request

- STATUS: OPEN
- PRIORITY: 330
- TAGS: pi,http,demos,0.1.6

`demos/classicube/test/classicube-browser.mjs`, the concurrent players: two Pi agents stream a
model response each from the test's provider, and Escape on player 1 must end player 1's
response (`interrupt cancels only the selected player`). It passed on 2026-11-08
(`work/evidence-2026-11-08/integrate/round-1108-evidence/rerun-demos.log`) and fails in the
0.1.6 reconcile round of 2026-11-11.

## Measured (2026-11-11)

- Player 1's agent takes the interrupt: its events end `interrupt`, `usage`, `settled`, and the
  game shows "Agent paused".
- Its response is never closed: the provider's `close` never comes within 180 s, while the
  test's probes (whole-session saves) take 1.5 s each, so it is not the probes' cost.
- No cancellation reaches the page's broker: `NetworkTransport.dispatch` logged no `cancel` in
  the whole run. The guest never cancels the slot: Pi's abort stops at the program or its HTTP
  client inside Dolly.
- HTTP cancellation itself works: `core-browser` (Ctrl+C on a `curl` of `/fixture/slow`, the
  response closes) and `shell-browser` (17 cancellations free their slots) pass. What fails is
  a running program aborting one of its own requests.

## Next

Bisect between 2026-11-08 and the round: the runtime Pi's JavaScript runs on, the HTTP client
(`host/http/client.c`) and what calls it, rebuilt today with the new seed compiler
(`d1cb11dbc`). Done when the ClassiCube test passes in Chromium.
