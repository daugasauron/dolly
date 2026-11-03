# http@0's limits sit above the services' own: merge proposal/http-limits

- STATUS: OPEN
- PRIORITY: 250
- TAGS: core,http,network

Two recorded Studio takes died on today's limits: Pi's request with ten PNG frames never left
the page (the broker's 8 MiB body cap, which the Anthropic SDK reports as "Connection error."
and retries, where the service's 413 makes Pi compact and go on), and Opus's 910-line answer was
cut at the 600 s deadline while it streamed. `proposal/http-limits` fixes both: a85477e3 raises
the body cap to 64 MiB (above the Messages API's 32 MB, so the service refuses, not the broker),
8519d689 refuses a timeout no browser timer can wait, f22cb90e makes `timeoutMilliseconds` bound
a wait (for the headers, the next bytes, or the program's read) instead of a whole request. Its
task, `tasks/20261101-222946-http-limits`, is on the branch with the measurements: a 6 s stream
under a 2 s rule completes, a stall is cut 2 s after its last line, a 630 s stream completes under
the default policy, in Chromium and Firefox.

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes, both. A local limit below the
remote one turns a refusal the program can act on into one it cannot, and total time protected
nothing: what a stuck transfer costs is a slot, which is held while waiting, so the bound is on
waiting. No authority changes: a body is admitted whole before it starts, bytes stay under
`maxResponseBytes`, every silence is still bounded.

Start from `proposal/http-limits` (base fa949c1b on `integrate/2026-11-02`), rebased on the
current integrate. The contract's text changes the http digest: a catalog round.

Done when: merged in a round and the branch's task closed with it; `test/http-broker.test.mjs`
and `test/network-browser.mjs` pass in Chromium and Firefox on the round's images (the 2 s rule's
three cases included); `docs/http.md` and `docs/browser-boundary.md` say what the timeout bounds.

## Record, 2026-11-04 (`core/http-limits-2`, `work/http`)

- Carried over by cherry-pick without the proposal's recipe pins (repinned on today's tree):
  `45e67191` (body cap, a85477e3), `30765d48` (timer range, 8519d689), `cd29b091` (timeout,
  f22cb90e), then the proposal's four task commits. No conflict outside recipes: of the files the
  three touch, only `docs/browser-boundary.md` had changed on integrate since fa949c1b. The http
  digest is the proposal's (`0a77a2b7…`): the contract files are the same bytes.
- `docs/browser-boundary.md` said what the timeout bounds only for multipart parts; it now has
  the rule in the Network section (a slot is held while a transfer waits; the timeout bounds each
  wait; a moving transfer carries only the body admission judged and at most `maxResponseBytes`).
- Janis's demo fixture (`janis-process.mjs`) posted 8 MiB + 1 to prove the kernel refuses an
  oversized body before dispatch; the proposal had not changed it, and under the new cap that
  body is legal. It now posts 64 MiB + 1.
- Folded from `core/release-fixes` (2a2f4f98, dd2d78e8, the task
  `tasks/20261101-173142-opus-recordings`, which exists only on that branch): its item "http@0's
  10-minute deadline cuts a streamed model response" (s11-chess) and its "Proposed:
  `proposal/http-body-limit`" are this task. Its four other items are not http's: the Rust test
  crate is `tasks/20261009-110500-rust-followups`, s8b's exit is
  `tasks/20261104-074502-terminal-mode`, the 6 GB capture is audit-runtime finding 21 (closed),
  bhop's pad 3 is a game-design question.
