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

- `demos/wine/test/wine-browser.mjs` also fails since 2026-11-08: NetSurf's Back never shows
  the first page again (`timed out waiting for the first page after Back`; passed in the same
  round-1108 rerun), twice in a row, so not load. NetSurf drops a fetch when it navigates;
  it may be the same: a live program's own cancellation.
- A suspect between the passing and the failing runs: `88297891a` (2026-11-10), "Threaded
  programs allocate with mimalloc" (`-pthread` links take `libmimalloc-mt`). Pi's runtime and
  NetSurf are threaded programs. Not measured yet.

## Measured (2026-11-12)

On the release served at 127.0.0.1:9045 (`a73ad906…`, main of 06:55), Chrome headless, the
`default` image with `amy install pi`, against a local server streaming chat-completion chunks
(scripts in the session's scratchpad, `weakref/sdk.mjs`):
- Pi's own `openai` 7.19.0 in janis, `controller.abort()` mid-stream: the server's response
  closes at the abort. Two janis processes streaming at once, one aborting at 2.5 s: that one
  closes at 2.7 s, the other runs on to its own abort.
- `pi --mode rpc --provider local` driven as the game agent drives it (`prompt`, then `abort`
  4 s later): `message_end`, `turn_end`, `agent_end`, `agent_settled`, the abort's response, and
  the server's response closes at the abort.
- So janis's fetch, the SDK (whose caller signal reaches the fetch through `AbortSignal.any`),
  the kernel and the broker cancel a running program's request. QuickJS keeps a WeakRef whose
  target a live WeakMap holds (a first probe that let its WeakMap go was wrong, not janis).
- Not reproduced: what differs in the ClassiCube test (the game's two players, its provider).
  The batch round's demo suite (`round/batch-1112`) runs it again on the new seed; next, if it
  still fails, log the guest's `httpCancel` calls and the kernel's answers in that test.

## Next

Bisect between 2026-11-08 and the round: the runtime Pi's JavaScript runs on, the HTTP client
(`host/http/client.c`) and what calls it, rebuilt today with the new seed compiler
(`d1cb11dbc`). Done when the ClassiCube test passes in Chromium.
