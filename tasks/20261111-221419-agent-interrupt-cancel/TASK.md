# Interrupting a Pi agent no longer cancels its model request

- STATUS: CLOSED
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

## Measured again (2026-11-12 evening, `test/events` at `0a471165b`, Chromium)

The ClassiCube test still fails there, at the same check. Everything below it cancels, each in
the default image with the test's server holding the response open until it closes:

- Janis's `fetch`, aborted by its signal after the first chunk, by `reader.cancel()`, and before
  the headers: the server sees the close each time.
- Two Janis processes, one aborting: only its response closes.
- Pi 1.0.3 in RPC mode (`amy install pi`, a `models.json` provider on the test server), sent
  `abort` once the server holds its request: the response closes when the abort is written.
- Two such Pi processes, one sent `abort`; also with `__dolly.saveSession` every 500 ms during
  it, after a save and a restore through `/session/?name=`, and with a reasoning model,
  `--thinking low` and `reasoning_content` deltas: player 1's response closes at the abort,
  player 2's stays open.
- The same with the harness's own steps: `clear_queue` before `abort`, `--session FILE`,
  `--no-prompt-templates`, and both Pis spawned with pipes by a Janis program that writes the
  RPC lines to `child.stdin`, as `mission.mjs` does: player 1's response closes at the abort.
- And with saves of 1.1 s every 500 ms (the probes' cost here is 1.5 s) while a program rewrites
  a file throughout, as the game its frames (`8476baa7f` holds such calls during a save).

So the HTTP client, the kernel's cancel and the broker work for a Pi that aborts. What the
failing case still adds: the `player.js` extension (`--no-extensions --extension`, `--tools
game_input`, `--system-prompt`), the `openrouter` provider at `https://openrouter.ai`, a
cross-origin request the page's `fetch` sends to the fixture (`redirectFetch`), screenshots in
the request body (larger than one packet), and the ClassiCube game running beside it. Pi settles there (the harness records `settled` on Pi's own `agent_settled`),
so Pi takes the abort and its fetch is not cancelled. Janis ignores `ESTALE` from `httpCancel`,
which is the kernel's answer for a request this process does not own.

Not the suspect named above: Janis does not link `-pthread`, so `88297891a` does not change it.

The probes feed Pi from `/bin/slop FILE | pi`: a brace group on the left of a pipe passes its
output on when it ends (`docs/slop.md`, Pipelines), so Pi would get the prompt and the abort at once.

## Next

Log in Janis's `failHttp` and `releaseHttp` (`/usr/lib/dolly/node.js` in the image) what the
game's Pi does at the abort, and the result of `httpCancel`, written to Pi's standard error,
which the harness keeps in `agent.stderr.log`. Done when the ClassiCube test passes in Chromium.

## Closed (2026-11-12)

Not a cancellation. A trace of http@0's calls in the process Worker during the ClassiCube test
(each start, cancel and failed poll, with the kernel's answer) shows player 2's Pi cancelling its
request at the interrupt, taken (0), and player 1's request never cancelled: the Escape went to
player 2. The screen after the test's click on player 1's tab shows the page's notice of a
refused request (Pi's `GET https://pi.dev/api/models/providers/openrouter`, which the test's rules
do not admit) over the display's top left, where the tabs are, and the notice took the click: it
came on 2026-11-11 (`4ec3519f9`). Fixed in `5a2dc9190`: the notice lets the pointer through, but
on its buttons. With it, `demos/classicube/test/classicube-browser.mjs` passes in Chromium
("interrupting one preserves the other") and `test/http-refusals-browser.mjs` in Chromium and
Firefox (`test/events` at `0a471165b` with the fix). Wine's NetSurf had the same cause, its
Back button at (18, 58) under the notice of its refused home page: `demos/wine/test/wine-browser.mjs`
passes in Chromium with the fix ("link, Back and Forward work").
