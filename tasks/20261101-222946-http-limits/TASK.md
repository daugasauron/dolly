# http@0's limits sit above the services they reach

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: core,http

## Closed (2026-11-05)

The owner decided yes to both (2026-11-04). The branch is on `main`: `core/http-limits-2`
(74371f945) carries a85477e3, 8519d689 and f22cb90e as 45e67191, 30765d48 and cd29b091. The
catalog round is the confirming round of 2026-11-05 (`integrate/2026-11-05` at 693b9842f, now
`main` 943019e6d, image inputs `88959af6…`; `work/integrate/build/round-1105b.log`), which built
every image. In `round-1105b-evidence/`: `test/network-browser.mjs` passed in Chromium (41.8 s)
and Firefox (44.1 s) (`browser.log`), with the 2 s rule's three cases. The source suite passed
475 of 475 (`source.log`); `http-broker.test.mjs`'s "a response lasts as long as it moves and
times out once it stops" was test 139. The merge's record is `tasks/20261104-074501-http-merge`,
which closes with this task.

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes, both. Carried onto
`core/http-limits-2`; its merge in a catalog round is `tasks/20261104-074501-http-merge`, which
closes this task with it.

## Summary for the owner

1. `proposal/http-limits` (two `Proposal:` commits on `integrate/2026-11-02` and its repin): `http@0` stops refusing what the services programs call accept.
2. Body cap 8 MiB to 64 MiB (P5 of `tasks/20261101-074546-audit-host`): above the 32 MB the Messages API takes, so the service answers 413, which Pi acts on, not the broker an `E2BIG` the SDK calls "Connection error.".
3. `timeoutMilliseconds` (name and 10-minute default kept) bounds a wait, not a whole request: the wait for the headers, for the next bytes, or for the program to read; a stream that keeps moving, like Opus's 910-line answer, completes.
4. Still every request is bounded and nothing gains authority: a server that never answers or stops is cut with `ETIMEDOUT` as before, bytes stay under `maxResponseBytes`. Measured in Chromium and Firefox: a 6 s stream under a 2 s timeout completes (cut at 2 s before), a stall is cut 2.0 s after its last line; under the default policy a 630 s stream completes.
5. Cost: one catalog round for both (the contract's text changes the http digest). Accept with "yes"; or take only the body cap (first commit) or only the timeout.

Done when the owner has decided and, on yes, the branch is merged with a catalog round.

## Why

Two failures in the recordings of Claude Opus 5.5 in Dolly
(`tasks/20261101-173142-opus-recordings`, `work/videos-2026-11-01/`), both a local
limit below the remote one turning a success into an error:

- **The body cap.** Pi's request with about ten PNG frames in its context never
  left the page: the broker refused a body over 8 MiB with `E2BIG`, and the
  Anthropic SDK reports every fetch rejection as "Connection error." and retries.
  The service would have answered 413 `request_too_large`, which Pi reads as a
  context overflow and compacts. Measured and prototyped by D: P5 in
  `tasks/20261101-074546-audit-host` (8 MiB + 1 and 64 MiB reach the server in
  Chromium and Firefox, 64 MiB + 1 fails as before).
- **The deadline** (`studio/s11-chess`, 2026-11-02 07:07): Opus 5.5 at high effort
  streamed a 910-line C file in one response; at 600 s the broker ended it
  ("Browser HTTP deadline exceeded") and Pi stopped. `timeoutMilliseconds` bounded
  a transfer from admission to its last byte (`host/http/broker.mjs`, one
  `setTimeout` per request).

## What the timeout bounds, from first principles

A transfer costs the page the same whatever it lasts: one of 16 slots, a Fetch and
its reader, a record of at most 64 KiB. Time costs nothing while bytes move. What
a stuck transfer costs is a slot that never frees and a program that never learns.
So the bound is on waiting: a transfer fails with `ETIMEDOUT` once it has waited
the rule's timeout for its next record. It can wait at three places, and all three
count:

- for the response's headers: a model's answer that is not streamed arrives whole,
  after minutes;
- for the next body bytes: a stream that stops;
- for the program to read the record before: a stopped or abandoned reader, so an
  abandoned handle still frees its slot, as it did under the deadline.

One value for the three. Clients split them (undici, Node's fetch: `headersTimeout`
and `bodyTimeout`, 300 s each, no total), but the longest silence before the
headers and between bytes is one quantity for the services Dolly's programs call
(a model thinking), and no embedding has asked for two. The SDKs programs use
bound only the first: `@anthropic-ai/sdk` 0.129.0 and `openai` 7.19.0 arm their
10-minute timeout around `fetch()` and clear it at the headers (`client.mjs`,
`fetchWithTimeout`); a streamed body has no time limit, and the Anthropic SDK
refuses an unstreamed request expected to take more than 10 minutes. So the
default stays 10 minutes: an unstreamed answer may take that long to its headers.

**The field keeps its name.** Saved sessions and result tabs carry the policy's
configurations (`httpPolicyConfigurations`, `host/http/http.mjs`) with
`timeoutMilliseconds` in each rule. Under a new name an old configuration's limit
would be ignored and read as the 10-minute default, a silent widening, unless the
old name were refused, a shim. The name fits either meaning: curl's
`CURLOPT_TIMEOUT` is a total, undici's `bodyTimeout` a wait.

**Authority does not change.** Total time bounded no destination, credential or
byte: a request is admitted with its whole body before it starts (no streamed
uploads), so a long transfer carries nothing out that admission did not judge,
and what comes in stays under `maxResponseBytes`. A rule with
`timeoutMilliseconds: 120_000` still refuses every two-minute silence. What an
embedding can no longer say is "no stream lasts longer than N"; the smallest
addition, if the owner wants it, would be a separate total, not proposed (no use
for it is known).

**The refusal** reaches the program as before: `ETIMEDOUT`, curl's status 28. The
clients' message (`dolly_http_error_message`) says "Browser HTTP request timed out"
instead of "deadline exceeded"; curl's own deadline (`-m`) shares it, so it names
neither.

Two side effects, both right: `build@0` and `packages@0` return 45- and 30-minute
rules; the build service keeps its own 45-minute total (`host/build/service.mjs`)
and sends progress every 10 s, so its stream is bounded as before. And a bootstrap
source of many parts (up to 2 GiB) no longer has to arrive whole within 10 minutes
(3.4 MB/s), only each part within one timeout.

## The change

- `host/http/broker.mjs`: `HttpTransfer.moved()` re-arms the timer after each
  record written into the slot (the URL record after the headers, each header line,
  each body record, the end). Each write needs both the network's bytes and the
  program's read of the record before, so a write is progress of the whole path.
  The Worker's wait for a writable slot gets the same deadline as before, the last
  write plus the timeout. 18 lines in, 8 out.
- `host/http/dolly-http-0.wat`, `host/http/http.h`, `docs/http.md`,
  `docs/browser-boundary.md`: the contract's text, the message and the docs.
- Tests: `test/http-broker.test.mjs` streams a byte every 10 ms for three timeouts
  of 100 ms (it fails before: the stream was cut after 9 bytes), then the same
  stream stopping, cut no sooner than a timeout after its last byte.
  `test/network-browser.mjs` adds a rule of 2 s for `/fixture/timeout/`: a stream
  of a line every 500 ms for 6 s completes, the same stream stopping is cut a
  timeout after its last line (curl 28, all 12 lines received), and a server that
  never answers headers is cut (curl 28).
- Not a proposal, on the same branch and mergeable alone: `8519d689`, the policy
  refuses a timeout above 2^31 - 1 ms. `setTimeout` waits no longer (Node fires a
  longer one after 1 ms, browsers convert it to a 32-bit integer), so such a policy
  ended every request at once (measured in Node: `ETIMEDOUT` after 19 ms).

## Measurements

Evidence under `work/audit-host/build/http-limits-evidence/`.

- Commits: `d07e816c` repins the six commands `integrate/2026-11-02` changed without
  repinning (amy, du, find, install, timeout, xargs; the integration tree's round writes
  the same), `a85477e3` P5 carried over, `8519d689` the timer range, `f22cb90e` the
  timeout. The first try committed stale source pins (see Lessons); the build caught it.
- `default` and `system` with their closure, 23 images, rebuilt on this branch in
  1,095 s at one job (`images.log`). The source suite passes (468).
- `test/http-broker.test.mjs`'s new case fails on the old broker: the 30-byte stream
  of three 100 ms timeouts was cut after 9 bytes (`unit-before.log`).
- `test/network-browser.mjs` passes in Chromium (46.7 s) and Firefox (52.2 s)
  (`network-after.log`), P5's 8 MiB + 17 and cap + 1 bodies included. With the old
  broker it fails in Chromium at its first timeout case: the 6 s stream ends in
  curl's 28 (`network-before.log`).
- The three cases timed (`timeout-cases.mjs`, a rule of 2 s, a line every 500 ms):

  | Case | Broker | Chromium | Firefox |
  | --- | --- | --- | --- |
  | 12 lines in 6 s, then the end | before | curl 28 after 2,068 ms, 3 lines | curl 28 after 2,086 ms, 3 lines |
  | | after | curl 0 after 6,578 ms, 12 lines | curl 0 after 6,579 ms, 12 lines |
  | 12 lines in 6 s, then silence | before | curl 28 after 2,108 ms, 3 lines | curl 28 after 2,062 ms, 3 lines |
  | | after | curl 28, 12 lines, closed 2,003 ms after the last | curl 28, 12 lines, closed 2,014 ms after the last |
  | no headers | before | closed 2,003 ms after the request | closed 2,001 ms |
  | | after | closed 2,000 ms after the request | closed 1,998 ms |

  The server saw every cut connection close: the page releases what it held.
- `test/core-browser.mjs` passes in Chromium (42.7 s) and Firefox (72.2 s)
  (`core-boundary.log`).
- `test/boundary-browser.mjs` does not finish on this branch: Chromium exceeds its
  120 s twice. Not this change: with the old broker it hangs the same way
  (`boundary-timed-oldbroker.log`), and with marks in a copy of its fixture no check
  is reached, the HTTP ones included (`boundary-marks.log`). It stops before
  `checkKernelBounds` returns, which starts `runtime@0` alone in a dedicated Worker
  (`hostRegistry`, `createHost`, `host.kernel.growing`). The cause was the kernel's
  memory growth, not this branch: fixed on `fix/boundary-hang` (`41c6a754`; the record is
  in `tasks/20261030-090000-chrome-grown-memory`).
- Under the default policy (no policy object, as in the recording), a stream of a line
  every 10 s for 630 s, longer than the old 600 s deadline (`long-stream.mjs`):
  curl 0 after 640.0 s with all 63 lines in Chromium, after 640.1 s in Firefox
  (`long-stream.log`). The recording's failure, 600 s into a moving stream, is gone.

## Lessons

- Name what a limit protects before choosing its unit. The deadline protected the slot
  pool, which a transfer holds while it waits, so it had to measure waiting; total time
  protected nothing and cut the one request that was working best. The body cap had the
  same flaw (P5): both were below the remote limit they stood in front of.
- `update-recipe-pins.mjs --sources` pins what `dist/static/` holds, not the tree's
  sources. After the rebase, this tree's staged copies were the old branch's, and the
  first two commits pinned 17 of system-build's sources (slop.c, cc.c, ls.c…) at their
  old hashes; the image build's staging rewrote them, which is how it showed. After a
  rebase, stage (build) before repinning sources, and compare the build's rewritten
  recipes with the commit.
- The integration branch is not always pinned between catalog rounds: six commands had
  changed on it without their recipes. A proposal branch then needs that repin as its
  own first commit to build, kept apart from the proposal's own pins.
- A setting the code hands to `setTimeout` has a range, 2^31 - 1 ms; outside it the timer
  fires early. Validate such a value where it is read, as the policy now does.
- Harness: `exit N` in a page's command ends the image's shell (the page then reports
  "host providers closed"); `/bin/slop -c 'exit N'` returns a number. A subagent that
  ends its turn to wait for a job stops; waits must stay in the foreground.
