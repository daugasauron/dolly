# Async HTTP handoff — 2026-09-12

## Where the work is

- Worktree: `/home/daug/dolly-audits/http-concurrency-20260912`.
- Branch: `codex/http-concurrency-20260912`, based on `95f330b`.
- Committed transport checkpoint: `c619e3a` (`Multiplex HTTP streams through a bounded browser broker`).
- The subsequent Response/relay fixes below are **uncommitted**. Integrating only
  `c619e3a` misses them, including the new untracked `test/response.test.mjs`.
- Other worktrees, GitHub Pages and daugasauron.com were not changed. The complete
  local release is served at <http://localhost:9003/classicube/>.

## What changed

### Transport checkpoint: actual overlapping HTTP

The old browser broker had one global active transfer/mailbox. Browser Fetch was
asynchronous, but another request could not start until that transfer released it.

Mailbox version 5 provides 16 independent slots, each with a 64-byte header and a
64 KiB body chunk in kernel Wasm memory. Handles encode slot and generation;
generations never wrap. The browser independently tracks active transfers rather
than trusting guest memory for capacity or authorization.

Admission briefly waits for the browser to validate and copy bounded request spans;
it does not wait for the HTTP response. Streams then progress independently.
Cancellation, process exit and Worker cleanup affect that process's handles only.
A cancelled provider retains its host slot until it settles, preventing an
unbounded abort/restart queue. Deadlines can report failure even when a provider
ignores abort; stale callbacks cannot overwrite a successor's response.

The sole network import remains `env.dolly_http_dispatch`. There are no sockets,
native process fallbacks or ambient browser capabilities. Destination/credential/
redirect/quota decisions still pass through the shared browser policy. See the
[boundary review map](browser-boundary.md) and [HTTP contract](http.md).

Main implementation map:

- `abi/dolly-http-0.wat`, `include/dolly/http.h`, `src/dolly.c`: versioned pool,
  handle lifecycle and polling. The outer import signature is unchanged.
- `src/http-broker.mjs`: bounded admission, independent `HttpTransfer` instances,
  streaming, stale-handle protection and cancellation.
- `src/process-kernel.c`, `src/process/runtime-adapter.c`: handle ownership,
  cleanup and unsigned handles across signed-i32 transport.
- `src/browser.mjs`, `src/runtime-worker.mjs`, `src/image-builder.mjs`: validate
  mailbox version/count at startup; do not mix old kernels with new host code.
- `src/runtimes/dolly-node.js`: Janis queues on pool exhaustion while pumping
  existing transfers; aborting a queued request does not affect a peer.
- `src/libcurl-fetch.c`: independent easy/multi transfer state. Git's multi calls
  admit and poll overlapping requests; the direct C start API still returns EBUSY.

Python/Bonnie and Rust consumers were also checked against the shared substrate.
All image definitions were rebuilt/repinned, not given separate HTTP backends.
ClassiCube/bhop and RTS additionally allow 120 seconds for Pi's first `get_state`
reply: concurrent cold initialization exceeded 30 seconds. Ordinary RPC deadlines
were not widened. Those changes are in `src/game-agent/mission.mjs` and
`src/rts/spectator/main.mjs`.

### Follow-up fixes: Firefox and the local Codex relay

Three distinct problems appeared during local testing:

1. The existing relays' exact CORS origin lists did not include port 9003. Both
   running services now allow its `localhost` and `127.0.0.1` origins, retaining
   their previous origins and tokens. This was a service configuration change,
   not a relaxation of Dolly's network boundary. Real Pi calls through each relay
   returned HTTP 200 in Firefox.
2. `new Response(errorText, {status, statusText})` was broken inside Janis.
   Dolly's constructor expected a private record, leaving `body` undefined. Pi's
   unchanged Codex adapter reconstructs failed responses this way, then `.text()`
   crashed on `getReader`, hiding the actual provider error. The constructor now
   accepts body/init, handles strings, binary views, streams and null bodies, and
   validates statuses. Broker responses use the same constructor. This does not
   claim complete Fetch/Streams compatibility; cloning remains unsupported.
3. The relay itself rejected a third active request with HTTP 429, independently
   of Dolly's pool. **The user explicitly asked to remove this cap.** It is gone;
   four simultaneous streams and independent cancellation have regression coverage.
   Authentication, exact origins, byte caps and deadlines remain. Provider-side
   limits still apply. Do not reintroduce a two-player/request relay limit.

Uncommitted source changes:

- `src/runtimes/dolly-node.js`, `test/response.test.mjs`,
  `test/fixtures/janis-process.mjs`: Response fix and regressions.
- `scripts/codex-relay.mjs`, `test/codex-relay.test.mjs`: remove the two-request cap.
- `modules/quickjs.dm` and the 11 dependent Dollyfiles: generated source/recipe
  pins for JavaScript, Pi variants, Studio, gamedev variants, bhop, ClassiCube and
  RTS. Preserve these with the runtime change.

## Verified state

- Transport checkpoint: 324 Node tests; exact ABI/boundary validation; browser
  libcurl, Git clone/fetch/push/cancellation, Janis, Tokio, Python/Bonnie PEP 517,
  CMake, Pi, Studio and game suites passed. Logs: `build/http-*.log`.
- Janis browser tests prove same-process and cross-process overlap, 18-request
  saturation, and killing a child while its parent's stream finishes. Reran after
  the Response fix, including reconstruction of an error Response.
- ClassiCube's deterministic browser test holds one player's stream open before
  starting the other, receives reasoning from both, and cancels one without
  cancelling the other. First reasoning measured 9–12 seconds in that test.
- Latest full Node suite: **327 passed, zero failures/skips**.
  Log: `build/response-unit-tests.log`.
- Firefox 155.0.1, final served Pi image: three real in-Wasm Pi processes make
  overlapping requests to a private synthetic relay. Two return `FIXTURE_OK`;
  one receives HTTP 400 and reports `FIXTURE_PROVIDER_REJECTION`, not `getReader`.
  No runtime file was substituted for this final check. Log:
  `build/firefox-response-peers.log`. Temporary test scripts/profiles were removed.
- All 32 current images passed release identity/source checks and browser
  PATH/filesystem inventory. Log: `build/response-publish.log`.

Use private fixture providers for further automated tests. Earlier live game
testing observed HTTP 429 while sharing the user relays; test calls could contend
with player traffic under the old cap. This is not evidence of an account quota
problem. Do not print credentials or commit private model configurations.

## Running local services and artifact

These paths/PIDs were checked when writing this handoff; recheck before restarting.

| Port | Service | PID | Private models configuration |
| --- | --- | --- | --- |
| 9003 | Dolly, all 32 images | 1058539 | — |
| 9002 | Codex relay, no concurrency cap | 1082735 | `/tmp/dolly-codex-relay-UnZrqQ/models.json` |
| 9092 | Codex relay, no concurrency cap | 1082717 | `/tmp/dolly-codex-relay-VklNTy/models.json` |

Relay 9002 additionally permits `http://localhost:9001` and
`http://127.0.0.1:9011`; relay 9092 additionally permits
`http://127.0.0.1:9091` and `http://127.0.0.1:9093`.
Both read local Codex credentials without modifying them. The running instances
use launch wrappers to preserve existing relay tokens; a normal CLI restart
generates a new temporary `models.json`. Clean shutdown removes its private
directory. These are separate development inference services, not browser imports.

The app follows `build/releases/current`, currently:

```text
3a80efdfb9bacbcb0f144b40370d16769c86789f48607823907a7041a5e29a49
```

`build/dolly-pages.tar.gz` is the accepted 868 MiB local artifact; no public upload
was performed. ClassiCube snapshot SHA-256 starts `ddebba70afce11f0`.
Existing tabs and saved sessions can retain the old in-Wasm runtime: use a fresh
image session to test the Response fix, and preserve user work before closing tabs.
The relay cap removal is already live without a page reload.

## Next agent

1. Review/commit the uncommitted fixes and this handoff before integrating the
   branch. Preserve other worktrees' unrelated changes. Nothing needs rebuilding
   merely to read this handoff; its documentation edit postdates the accepted
   release's source manifest.
2. For a changed runtime, use the normal image pipeline and repin consumers:

   ```sh
   DOLLY_BUILD_IMAGES=classicube npm run image -- classicube
   DOLLY_BUILD_IMAGES=all npm run snapshot
   node --test test/*.test.mjs
   DOLLY_BUILD_IMAGES=all DOLLY_IMAGE=javascript DOLLY_BROWSER_MODE=janis-process ./scripts/test-browser.sh
   DOLLY_BUILD_IMAGES=all npm run publish
   ```

   Publication is local packaging/acceptance, not a public deployment. Keep all
   32 local images. Reuse valid caches: Codex's earlier cold build took 93.7 minutes;
   the Response-only update did not rebuild it. Full release packaging still
   takes minutes, including sequential browser inventory for every image.
3. No reproduced async HTTP blocker remains in the tested paths. Await the user's
   multiplayer retest; for new failures distinguish browser transport errors,
   actual provider HTTP statuses and Pi/runtime errors before changing policy.
   Firefox hides CORS details from Fetch; a generic transport failure alone does
   not identify its cause. Keep tests on an isolated provider.

Known limits: the in-browser 16-slot pool remains intentional bounded transport
storage, distinct from the removed relay cap. Janis eagerly queues response chunks
inside Wasm rather than implementing full consumer-driven stream backpressure.
The historical RTS `mouse menu/quit` stall reproduced under concurrent build/test
load, then passed unchanged on rerun; it is not established as fixed by HTTP work.
