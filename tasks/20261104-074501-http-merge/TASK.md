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
