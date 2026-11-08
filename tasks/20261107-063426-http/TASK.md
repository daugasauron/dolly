# HTTP: a cancelled transfer leaves its slot failed for good; after 16, every request is refused as busy

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: http,network,core,bug

Found by reading, by two auditors independently (the core audit of 2026-11-07 at 9684c7334,
`work/audit-core-2026-11-07/REPORT.md` 3.8, and its helper tracing `curl` to the broker); the code
path was checked again on saving the report, then reproduced (State). Owner (2026-11-07):
"Create tasks for the bug".

## State (2026-11-07)

Reproduced on v0.1.5's kernel (`system` image of `integrate/0.1.6` before the fix): 17 transfers
cancelled by `curl -m 0.3 /fixture/slow`, then `timeout 20 curl -fsS /fixture/http.txt` exits 124
in Chromium (`work/integrate/build/http-slot-evidence/leak-before.log`): the pool is gone.

Fixed on `fix/http-slot` (`def4a5773`, merged into `integrate/0.1.6`): `http_cancel` advances the
slot's sequence with the cancellation. `test/shell-browser.mjs` gains the 17 cancellations by
timeout and by closed pipe, then a request that completes; `test/http-broker.test.mjs` delivers
the page's failure after the kernel's release and passes (24 of 24). Left: the 0.1.6 round, whose
runtime carries the fix (`http.h` is in the http module's digest and its client in the seed, so
it rebuilds every image), runs `shell-browser.mjs` in both browsers.

## The path

1. A program cancels a live transfer: `curl -m`, a write failure such as `curl URL | head`, or
   Ctrl-C (`src/libcurl-fetch.c:744` calls `dolly_http_cancel`, reached from `:761-763`).
2. `http_cancel` (`host/http/kernel.c:123-131`) dispatches a cancel (a null method) through
   `env.dolly_http_dispatch`, and as soon as that returns stores `DOLLY_HTTP_STATE_IDLE` in the
   slot without advancing its sequence word; the packet handler clears the slot's owner
   (`:279-291`).
3. The Worker reads the null method as a cancel (`host/http/broker.mjs:51-54`) and the page
   aborts the fetch, holding its own slot until the transfer settles (`:167-172`, `:244-249`).
   The transfer then ends with ECANCELED, posted to the Worker as `http-fail`
   (`host/http/http.mjs:27`, `:31-36`), which handles it after the import has already returned
   (`broker.mjs:18-27`).
4. `HttpMailbox.fail` (`broker.mjs:117-123`) still finds its sequence current, because step 2
   left it unchanged, and stores `DOLLY_HTTP_STATE_FAILED` over the IDLE slot.
5. Nothing ever resets it: `http_start` takes only IDLE slots (`kernel.c:65-68`); the FAILED→IDLE
   reset in `http_poll` is behind an ownership check that now fails (`:96-103`, `:251-261`);
   `http_release` at process exit cancels only the process's owned slots (`:316-330`).
6. With 16 slots (`DOLLY_HTTP_SLOT_COUNT`), the 16th cancelled transfer leaves none: every
   `DOLLY_HTTP_START` returns `-EBUSY`, and both clients retry forever every 10 ms
   (`host/http/client.c:152-156`, `src/libcurl-fetch.c:769`). The session's network hangs until
   the page reloads; Pi's model calls, `curl`, `git` and pip all go through these slots.

`test/http-broker.test.mjs:378-392` asserts the page's half (failed after cancel) without a kernel
in the loop, so the suite passes with the leak.

## Reproduce

In `default` (or any image with `curl`) under a policy that admits a slow URL, run
`curl -m 0.001 URL` 17 times, then `curl URL`: by the reading above the last one never returns.
Repeat with `curl URL | head -c 1` (the write-failure path).

## Fix

The slot must not be reusable by `fail` after the kernel released it. Either `http_cancel`
advances the slot's sequence before marking it IDLE (so the late `http-fail` sees a stale
sequence and returns, as `HttpMailbox.fail` already does for one), or `HttpMailbox.fail` returns
when the state word is IDLE. Choose the one that keeps the ownership rule in one place, the
kernel. Then the unit test asserts the outcome with the kernel's half included.

## Done when

- A browser test (in `test/network-browser.mjs` or beside it) cancels 17 live transfers by each
  path (`-m`, a closed pipe, Ctrl-C) and then completes a request; it fails before the fix and
  passes after, in Chromium and Firefox.
- `test/http-broker.test.mjs` no longer asserts a FAILED slot after a cancel the kernel released.

## Closed (2026-11-08)

The 0.1.6 verification round (`integrate/0.1.6` at `c1479e7ac`) rebuilt every image on the
runtime with `def4a5773`. `test/shell-browser.mjs` passed in Chromium (14.9 s) and Firefox
(19.8 s) there (`work/integrate/build/round-1108-evidence/browser.log`). It runs 17 cancellations
by `curl -m` and 17 by a closed pipe (`curl | head -c 1`), then a request that completes.

A third path, added since: 17 Ctrl-C presses, each on a transfer the test's server has received
and holds open (`/fixture/held`), then a request that completes. It passed in Chromium (14.3 s)
and Firefox (15.9 s) (`shell-ctrlc.log`).

The failure before the fix was measured for `-m` (`leak-before.log`); all three paths end in
`http_cancel`.
`test/http-broker.test.mjs` asserts the page's failure after the kernel's release (473 of 473
source tests in the round).
