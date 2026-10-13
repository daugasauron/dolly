# Browser boundary and trusted code — audit of `work/rust` (`integrate/round-1013` at `0fbf5146`, nena merged as `baae3bba`)

Read-only. No browser was run; every claim below is from source, with file and line.

## The five things I would do first

1. `host/modules.mjs:105` hands `{ list, enable, disable }` to **every** module's `browser()`; give it only to the provider whose manifest declares it, so "nena's page side alone" (`host/README.md:68-70`) is true by construction, and assert it in `test/host-modules.test.mjs`.
2. On a lease-bridge module's Worker `dispose()`, write an error into every pending reply slot as `host/gpu/bridge.mjs:17-21` does: a call in flight when its module is disabled is otherwise deferred forever (`src/device-lease.c:52,71-73`).
3. Take `src/terminal-text.mjs` (63 lines) and input's `submit/input/paste/key` (`host/input/input.mjs:489-492`) out of the shipped page into the test harness, then decide what the remaining ~20 `__dolly` members are (audit-24 steps 2-3, unchanged).
4. Import a provider's JavaScript when its module is enabled, not at registry load (`host/modules.mjs:7-8`): a `default` page then loads no GPU, audio, microphone or buttons code, and `enable()` already has the await for it.
5. Two cheap tests the model lacks: a saved `system` session with a planted `/etc/dolly/enabled` loads with its modules unchanged; `__dolly.microphone.liveTracks` is 0 after `nena disable microphone` while capturing.

## nena@0

**No hole found.** Without `nena@0` nothing the userspace writes reaches the page's set; with it, every switch is the page's and bounded as the model says. Three weaknesses (W1-W3 below).

**Where the set lives, who reads it at enforcement.** The set is the `instances` Map of the page's `createHost("browser")` (`host/modules.mjs:41`), mirrored by the Worker's own map through `host-switch` messages only the page sends (`modules.mjs:165-169, 291-311`). The runtime Worker's `self` listener (`src/runtime-worker.mjs:95`) is reachable from the page alone: process Workers are its children and their messages land on `worker.addEventListener` (`src/process-supervisor.mjs:455`). Enforcement reads the Worker's map at each call: a switchable module's kernel import is a closure testing `instances.has(owner)` (`modules.mjs:264-265`); a detached module's page handlers are deleted (`modules.mjs:131`), so even a trusted Worker request would go unanswered. The loader's `checkHostAbi` at every launch (`process-supervisor.mjs:416`) is a compatibility demand. Kernel memory holds no module state (`host/nena/kernel.c:1-2`). `/etc/dolly/enabled` is read by trusted code in one place, nena's Worker `start()` (`host/nena/nena.mjs:106-112`), which exists only when the page attached `nena@0`; the page attaches exactly `loadImageHostRequirements()` of the recipe (`src/browser.mjs:110,116`), plus the build host on a rebuild and `snapshot@0` on a session route. `src/dollyfile.c:2197-2203` reads the file too, in Wasm, for amy's install check: a demand, not a grant.

**1. With `nena@0` in `default`** (declared: runtime, display, input, download, dso, http, nena, packages, snapshot, sockets, threads, upload; `Dollyfile:3-14`). What a compromised userspace can now add, and what still stands:
- `gpu@0`: WebGPU on the page's adapter and one hidden canvas; `check()` must obtain an adapter (`host/gpu/gpu.mjs:9-19`); the GPU worker's quotas. Nothing of the user's.
- `audio@0`: an AudioContext that resumes only on a trusted key or pointer event (`host/audio/audio.mjs:17-19`).
- `microphone@0`: `getUserMedia` at OPEN (`host/microphone/provider.mjs:39`); the browser's prompt decides; the page indicator shows while held (`microphone.mjs:19-33`).
- `buttons@0`: a text strip; the clipboard only inside the user's click on the page's own Paste button (`host/buttons/buttons.mjs:41-43`).
- `pty@0`, `sockets@0`: nothing outside Wasm; only the loader's check changes.
- download, upload, threads, dso, packages: already declared; switching them is a loss, not a gain.

Never switched: `runtime`, `http`, `display`, `input`, `snapshot`, `build`, by the manifest's `fixed` field, enforced at `modules.mjs:175,201` and bound directly at `:264`; tested for runtime/http/display/build (`test/nena-browser.mjs:133-137`), not for input/snapshot (same path). `nena disable nena` is enforced outside Wasm: `modules.disable("nena@0")` detaches the Worker binding (`-ENOSYS`, `nena.mjs:101-102`) and deletes the page's `nena-request` handler; no other code path calls `enable` (`nena.mjs:68`; tested `:163-168`). Not persisted, by decision (`tasks/20261012-230015-bridges/TASK.md:106-113`).

**2. Without `nena@0`.** No path: the page never attaches nena, the Worker never reads the file, the import answers `-ENOSYS`, the page has no handler (`test/host-modules-browser.mjs:88-95`). A crafted session (`snapshot@0`) restores a filesystem delta only (`host/snapshot/snapshot.mjs:64-73`); its `/etc/dolly/enabled` is read only where the image declares `nena@0`, and then `modules.enable()` applies the same refusals (fixed, closed embedding, dependencies, `check()`). It gets what `nena enable` would, before ENTRY: the owner's model. The planted-file case in a non-nena image has no test (five things, 5).

**3. Revocation.** Page side: microphone stops tracks and closes its context (`provider.mjs:21-26,131`); audio releases streams and closes the context (`host/audio/provider.mjs:115-118`); GPU terminates its Worker and wakes every slot with EIO (`host/gpu/bridge.mjs:11-24`); buttons remove the strip; download revokes Blob URLs (`download.mjs:99`); threads terminate Workers and the supervisor ends their programs (`threads.mjs:30-32`, `process-supervisor.mjs:193-198`); dso stops serving new processes only (`dso.mjs:23`), and a running loader has no page authority. Immediate for page resources, yes. Not for a request in flight (W2).

## Findings

**W1 — weakness.** The switch capability goes to every provider. `host/modules.mjs:105` passes `modules: { list, enable, disable }` to each `browser()`; `host/README.md:68-70`, `docs/browser-boundary.md:113-114` and `modules.mjs:153-154` say only nena has it. Attacker gain: none (providers are trusted). Cost: the lock holds by grep. Fix: pass it only when the manifest says so; test that no other instance receives it. Confidence: high.

**W2 — weakness.** A call pending when its module is disabled never completes. The page's completion arrives after `detach` deleted the `*-complete` handler (`modules.mjs:131`) and the Worker's `dispose()` dropped the bridge (`audio.mjs:52`, `microphone.mjs:64`, `buttons.mjs:87`, `nena.mjs:120`); the kernel keeps `lease->pending=1` and returns `DISPATCH_DEFERRED` without re-dispatching (`src/device-lease.c:52,71-73`); re-enabling creates empty slots, so the process stays stuck. The `holder` test calls only after `nena disable` returned (`test/nena-browser.mjs:41-44`). Reproduce: a microphone READ issued while a sibling runs `nena disable microphone`. Fix: Worker `dispose()` writes ENOSYS into pending slots as `gpu/bridge.mjs:17-21`. Confidence: medium-high.

**W3 — weakness.** Session re-enables run inside the `host-ready` handshake's 10 s timer. `nena.mjs:88-94` awaits each `modules.enable()` in `start()`; the Worker rejects after 10 s (`modules.mjs:148`); a GPU bridge may take up to 10 s to initialize (`bridge.mjs:10`). A session that recorded `gpu@0` on a slow adapter fails to boot and its file cannot be edited without booting; recovery only via `recover=1` into `system`. Fix: enable after the ack, or exempt a switching `start()` from the timer. Confidence: medium.

**W4 — weakness.** Dependents are not checked on disable. `enable` requires dependencies (`modules.mjs:177`); `disable` never asks who depends on the module. Holds because only `runtime@0` and `http@0` are depended on and both are fixed; nothing asserts it (`test/host-modules.test.mjs`). Fix: a test "every module another depends on is fixed". Confidence: high.

**W5 — weakness.** Credential stripping is a six-name list (`host/http/policy.mjs:8-15`). A hardened rule without `credentialHeaders` still lets `private-token`, `x-auth-token` or a bearer in a custom header leave, to that rule's destination only. The code says "common" (`policy.mjs:244`). Fix: say so in `docs/http.md`, or give hardened rules an `allowHeaders` list. Confidence: high.

**W6 — weakness.** A loaded session enables modules silently: `nena.mjs:89-92` reports refusals only. A session file listing `buttons@0` and `microphone@0` restores them before ENTRY with no line on the page (the prompt still stands). Fix: one `showStatus` naming what the record enabled. Confidence: high.

**C1 — cleanliness.** The test surface ships in every page. `src/browser.mjs:226-230` defines `window.__dolly` unconditionally: 24 members with all modules enabled (display 4, input 5, runtime 2, http 3, audio, microphone, gpu, buttons, snapshot 2, page 4); `src/terminal-text.mjs` and `input.mjs:489-492` exist for tests; 102 files use it; no document names it. Not reachable from Wasm: no kernel import hands out `window`, and the plugin loader refuses JS bindings (`src/kernel-plugin.mjs:38-42`). `__dolly.saveSession(name)` lets any same-origin script persist a session without a click. Audit-24 items 2, 3, 4, 7 (`static-asset.mjs:38-41`) and 8 (`runtime-worker.mjs:142`) are still true. Confidence: high.

**C2 — cleanliness.** Every provider is imported on every page (`modules.mjs:7-8`), 18 `host` files whether or not the image can use them. Confidence: high.

**C3 — cleanliness.** The trusted-size ledger was not kept. `tasks/20260930-100000-audit-24/TASK.md:10-12` says the total "does not grow without a line here saying which authority was added"; it records 10,204 and 10,208; this tree is 10,542 (`src/*.mjs` 4,193 + `host/**/*.mjs` 6,349; `modules.mjs` 218 to 330, `nena.mjs` 122). The nena merge added no line. Confidence: high.

**C4 — cleanliness.** `AGENTS.md`'s new sentence "An image's host modules are its recipe's list" is wider in code: a rebuild adds `http@0`, `threads@0`, `dso@0` (`browser.mjs:116-117`, `modules.mjs:13`), a session route adds `snapshot@0` (`browser.mjs:110`), `DOLLY_HOST_MODULES` replaces the list (`browser.mjs:116,122`). The review map says so (`browser-boundary.md:120-124`); AGENTS does not. The other new sentences match the code. Confidence: high.

**C5 — cleanliness.** The page parses the recipe language in JavaScript to decide a custom image's module set: `src/dollyfile-view.mjs` (317) and `dollyfile-graph.mjs` (125) feed `src/image-build.mjs:96-97` and `image-builder.mjs:13`. A second parser whose output is a trust decision. Fix: reduce the trusted extraction to `REQUIRES HOST`/`ENTRY`/`FROM`. Confidence: medium (parser not read in full).

**C6 — cleanliness.** A `check()` that loses the 5 s race still runs its side effects (`modules.mjs:183-184`): gpu's `indicate()` (`gpu.mjs:17`) rewrites the indicator after the switch was refused. Confidence: high.

**C7 — cleanliness.** The largest trusted files are packet interpreters and loaders: `process-supervisor.mjs` 825, `gpu/worker.mjs` 699, `dso/ffi.mjs` 693, `input/input.mjs` 535, `wasm-interface.mjs` 391, `dso/process.mjs` 386. The DSO loader and FFI (1,079 lines) run in the process Worker with no page authority (`dso/process.mjs:147-246` resolves imports from the process's own instance; no `fetch`, `eval`, `postMessage`, `globalThis` in either file): the clearest candidates for Wasm. Confidence: high on authority, medium on cost.

## The standing boundary (Q4, Q5)

Kernel imports: 12 (`abi/dolly-browser-0.wat`). From `runtime@0`: `env.memory`, two clocks, entropy (64 KiB, `host/runtime/runtime.mjs:103-108`), bootstrap text (1 MiB, `:94-99`). `dolly_http_dispatch`: spans checked, policy before fetch (`broker.mjs:84-107,218`). `dolly_download_dispatch`: checked name, Blob, user click (`download.mjs:11-15,84`). Five lease-bridge dispatches: bounded copied packets, non-reused scopes (`lease-bridge.mjs:28-53`). Process Worker: 2 imports (`process-worker.mjs:140-143`); `call` posts a syscall to the supervisor. Gate: two memories. Display plugin: 30, all kernel exports (`kernel-plugin.mjs:44-56`). Nothing hands out eval, a URL fetch, a DOM handle or free-form `postMessage`; the page's `handle()` dispatches typed messages to registered handlers only (`modules.mjs:317-320`).

HTTP: destination, credentials, redirects (`redirect: "error"` unless default policy and flag 2, `broker.mjs:229`; never for relays; intersection when inherited, `policy.mjs:301`) and quota are enforced in the page before fetch on every path: local services (`local-services.mjs:16-21`), the build service (POST only, one at a time, 8 MiB log, 45 min; `host/build/service.mjs:26-29,41,81`), the package service (64 per page, one at a time; `host/packages/service.mjs:27-35`), builders (policy without services, `http.mjs:50`). There is no approval step for HTTP anywhere; the default policy admits every origin with credentials, as `browser-boundary.md:159-161` says in bold. The page holds no API key: `rule.credential` is refused (`policy.mjs:80-84`); keys live in sandbox files and env and are readable by construction. The package service fetches the site's packs outside the policy quota (`service.mjs:40-41`), to a page-fixed destination.

Constraints (Q8) with code and test: the single network edge (WAT, `validate-browser`, `test/sockets-browser.mjs:45-49`); the nena model (`nena-browser`, `host-modules-browser`); microphone denial (`microphone-browser.mjs:82-84`); Paste (`buttons-browser`). Code, no test: page resources released on disable (W2, five things 5); dependents (W4). Stated, no code: "nena alone" (W1); "recipe's list" (C4); "process bookkeeping in Wasm" versus the supervisor's mirrored tree (`process-supervisor.mjs:226-247`, the core auditor's item).

## What is right and should stay

- One import list in WAT, one owner per import, a switchable import closing over the live set (`modules.mjs:255-268`): the switch acts where containment is.
- Kernel memory holds no module state; the page decides, the Worker follows by message, the file is a record, not an authority (`nena/kernel.c`, `nena.mjs:11-14`).
- `nena disable nena` answered before the provider goes (`nena.mjs:66-68`); the fixed set is a manifest field, not a name list.
- Lease bridges with copied packets and non-reused scopes; GPU's `stop()` waking every slot is the pattern the others should copy.
- Tests that act as a compromised program (`nena-browser.mjs:33-35,50-51`; `host-modules-browser.mjs:94-95`).

## What I could not determine

- W2 and W3 are read, not run; whether a DEFERRED call is killable by Ctrl+C.
- Whether the two demo tests still rewrite the GPU worker's source (audit-24 item 6; `demos/` not read).
- Which `src/*.mjs` are page-loaded; 10,542 is `wc -l` of all, the ledger's own method.
- Whether a session delta replacing `/etc/dolly/entry` is intended: `runtime-worker.mjs:59,312` reads it after restore, so a session file chooses the ENTRY program; within "compromise can persist in a saved session" (`browser-boundary.md:221-222`), noted, not ranked.