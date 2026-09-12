# Concurrent HTTP checkpoint

Branch: `codex/http-concurrency-20260912`, based on `95f330b` (ClassiCube and bhop).
Existing worktrees and deployed sites remain untouched.

## Contract

- One network import and one short browser policy path; no sockets or native fallback.
- A fixed pool of 16 independent 64 KiB response slots in kernel Wasm memory.
  The browser independently bounds active providers; guest memory cannot grant capacity.
- An opaque request handle identifies a slot and generation. Start copies bounded
  request spans before returning. Poll, cancellation and process exit affect only
  matching requests. Multiple requests from one process are supported.
- Cancel aborts without waiting for another provider. A cancelled host slot stays
  occupied until its provider settles, preventing an unbounded abort/restart queue.
- Each transfer retains its deadline, response cap and backpressure. All transfers
  share the embedding's authorization and request quota. Default HTTP(S) stays open.
- Explicitly version the changed transport semantics. Rebuild every image against
  the shared kernel/adapters; do not introduce image-specific HTTP implementations.

## Verified scope

- [x] WAT, kernel, browser handshake, process ownership and teardown agree.
- [x] Janis/Pi, C/libcurl/Git, Python/Bonnie and Rust adapters audited and adapted.
- [x] Admission, bounds, shared policy/quota, slot saturation, stale handles,
  stalled readers, deadlines and independent cancellation have regression coverage.
- [x] Real browser proves overlapping requests in one process and separate
  processes, including model streams; one player's cancellation preserves peers.
- [x] All image definitions rebuilt and accepted; affected representative workloads
  and ClassiCube multiplayer pass browser tests without paid credentials.
- [x] Documentation and boundary review map describe the final implementation.

This is bounded compatibility evidence, not complete Fetch/libcurl compatibility.

## Current evidence

- Kernel/seed builds pass exact ABI validation; all 32 image source sets are pinned.
- All 324 Node tests pass. The focused 34-test suite includes signed-i32/high-bit
  handle transport. Stale ClassiCube/bhop inventory expectations were corrected.
- Browser libcurl proves two requests arrive before either completes. Distinct
  fixture URLs avoid Chrome's identical-GET cache lock.
- Browser Janis proves same-process/cross-process overlap, 18-request saturation,
  and killing a child with two streams while the parent's stream finishes.
- Browser boundary/default-policy, Git clone/fetch/push/cancellation, process
  ABI/lifecycle, Tokio HTTP, Pi streaming/tool calls, Python/Bonnie PEP 517 and
  CMake configure/build/install/run suites pass. Boundary tests instantiate the
  canonical HTTP Wasm constants and compare the browser implementation.
- A provider ignoring abort still reports deadline failure to Wasm. Its host
  slot stays occupied until it settles; late results cannot resurrect an error
  already consumed by Wasm. Focused and browser suites pass after this fix.
- All 32 snapshots rebuilt, pass final identity/recipe/input checks, and pass live
  PATH/filesystem inventory. Codex's cold source build took 93.7 minutes; its TUI,
  tools, device-login cancellation/persistence and refresh browser suites pass.
- Studio's real HTTP build service passes streaming, cancellation and explicit
  user opening; bhop's Pi/tools/recording/recovery suite passes. Front-page tests pass.
- ClassiCube passes streaming, tools, retry recovery and session restore. Cold Pi
  initialization repeatedly exceeded the old 30-second RPC deadline; no stdin
  defect was found. ClassiCube/bhop and RTS now allow 120 seconds for the first
  state reply only, retaining ordinary RPC and cancellation deadlines. These
  three images are refreshed; ClassiCube's full browser suite passes.
- ClassiCube's proof holds one player's stream open before starting the second,
  separating HTTP overlap from simultaneous cold startup. Snapshot probes run
  less frequently to reduce test-induced load. Both real Pi processes received
  reasoning with both responses open; cancelling player 1 closed only its stream,
  and player 2 finished afterward. Prompt-to-first-reasoning measured 9–12 seconds.
- The RTS test initially reproduced the previously documented `mouse menu/quit`
  stall under concurrent build/test load. Its rerun passes unchanged game/input
  checks, native replay/CRC validation, foreground cancellation and both real Pi
  sessions (9 fast-provider versus 4 slow-provider requests). No game-test timeout
  was increased; the historical load-sensitive stall remains documented.

Logs: `build/http-*.log`. Deployed sites remain unchanged.
