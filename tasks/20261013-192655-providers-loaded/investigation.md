# Every provider's JavaScript is loaded on every page: the investigation

Read on `work/rust` (`integrate/round-1013`, head `f56fe5e0`, 2026-10-14 04:27-04:35 JST; history shared with `main`). Nothing was built or run; every number comes from `wc -c`, `grep` over `import … from` lines (a static closure computed by shell, dynamic `import()` excluded) and `git`. Line numbers are of this tree unless a commit is named. No verdict.

## Summary (findings, no advice)

1. The registry has imported every provider since its first commit, `018c5f27` (2026-09-27, eight static `import * as X` lines, `src/host/modules.mjs`); `fe9cac9a` (2026-10-01) turned them into one `await import(new URL(manifest.host, manifest.url))` over all 18 manifests at load (`host/modules.mjs:7-8`). The registry already uses dynamic `import()`; only its time (load, not enable) is at issue.
2. The comment "This fixed registry is trusted embedding code. Images select no JS or Worker URLs" was written at `018c5f27` and answers the Codex host-modules design of 2026-09-26: "A fixed trusted registry maps module IDs/ABI versions to implementations … An image cannot name a JS file or Worker URL" (`tasks/20260926-092542-codex-host-modules/TASK.md:77-79`). It is about who chooses the file, not when it is fetched.
3. Loading on demand was proposed once, as step 4 of `audit-24` (2026-10-06 measurement: "every provider is imported whatever the image declares"), still open as item 4 of its 2026-10-13 state. No owner statement on it was found. No bundler serves the page or the runtime Worker (esbuild bundles the process Worker only); each import is one request.
4. Today a `default` page requests 76 JavaScript files (1,206,557 bytes, of which 845,494 are generated `dist/` data) and 18 `module.json` (7,168 bytes): 94 module requests. The runtime Worker requests 69 + 18 again (67 URLs the same). The providers account for 55 files, 253,117 bytes, beyond what `src/browser.mjs` imports anyway.
5. `default` declares 12 modules (`Dollyfile:3-14`, `nena@0` among them). The 6 it does not declare (gpu, audio, microphone, buttons, build, pty) cost 15 files, 41,577 bytes, on each side: 3.4 % of the page's JavaScript bytes, 11.5 % of its checkout (non-`dist/`) code, 0.25 % of a first load (snapshot 14,307,460 B, font 1,074,932 B, `dolly.wasm` 213,424 B). `system` (7 modules): 25 files, 62,335 bytes. The menu page loads no script at all.
6. The heavy parts are already lazy: `gpu/worker.mjs` (44,981 B, 699 lines) is fetched by `new Worker` only when `gpu@0`'s Worker side starts (`host/gpu/bridge.mjs:5`); `build/ui.mjs` by `import()` inside `browser()` (`host/build/build.mjs:8`); the microphone worklet at OPEN (`provider.mjs:42`); the DSO bundle at `dso@0`'s start (`dso.mjs:12`).
7. No provider runs page-touching code at import: top-level statements are imports, exports, declarations and `new TextEncoder/TextDecoder/Set/Map/Uint8Array`. `document`, `navigator`, `location`, `window` are reached only inside `check()`, `boot()`, `browser()`, `worker()`. An imported, unenabled provider holds no DOM, listener or Worker.
8. The audit's "18 `host` files" undercounts: 18 entry files pull 46 `host/` files, 6 `src/` files and 3 `dist/` stubs (55), plus the 18 manifests. "`enable()` already has the await": it is async with four awaits (`:186,190,192,194`); the provider object is first needed at `:186` (`module.check`). But the registry also needs provider objects outside `enable`: `selectBoot` (`:20-30`) calls `boot` over every definition at page boot, `admit` (`:240`) and `host-switch` (`:306`) read the provider's `digest` export for declared-but-unenabled modules (a build host, `runtime-worker.mjs:115`), and the Worker's `host-switch` handler (`:299-307`) attaches on its own side.
9. A late `import()` finds its file while the version is published: files under `/vX.Y.Z/` are immutable and old versions are redeployed as hard links (`scripts/export-cloudflare-pages.mjs:64,115-138`); only an explicitly removed version stops (`docs/deployment.md:171-173`). The service worker caches nothing (`coi-serviceworker.js`: headers only). Offline, a late import fails unless the HTTP cache holds the file (immutable on Cloudflare; `no-store` from `npm run serve`; GitHub Pages "sets its own caching").
10. Not found by reading: the time a late import adds on a slow connection; whether a browser serves the Worker's second fetch of the same 67 URLs from cache; any owner statement on step 4; the compressed size of `default`'s four packs.

---

## 1. History

### 1.1 Before the registry (to 2026-09-27)

`tasks/20260926-092542-codex-host-modules/TASK.md:17-18` describes the state: "`src/runtime-worker.mjs` and `src/browser.mjs` wire providers centrally." The task (STATUS CLOSED, priority 260, "Initial DOLLY 4 implementation verified on September 26") set the design, lines 77-81:

> "The embedding host chooses permitted providers and their policies. A fixed trusted registry maps module IDs/ABI versions to implementations with dependency, probe, bind and disposal operations. An image cannot name a JS file or Worker URL. Missing, denied or incompatible mandatory providers fail before ENTRY with an actionable error; use metadata for early checks before large snapshot downloads. Do not add a general package/plugin loader or optional-feature framework."

The sibling threads task says the same for threads (`tasks/20260926-181716-codex-threads/TASK.md:118-119`: "No guest-selected Worker URL, new browser imports, ambient fetch").

### 1.2 `018c5f27` (2026-09-27): the registry is born with static imports

`git log --diff-filter=A -- src/host/modules.mjs` names `018c5f27` ("Checkpoint threaded Lua Blockwalker and the active cargo world", author kallur). Its `src/host/modules.mjs:1-13`:

```
import * as runtime from "./runtime.mjs";
import * as display from "./display.mjs";
… (http, gpu, download, upload, snapshot, threads)
// This fixed registry is trusted embedding code. Images select no JS or Worker URLs.
const definitions = [runtime, display, http, gpu, download, upload, snapshot, threads];
```

Eight providers, every one imported statically by the registry; `src/browser.mjs` imported `./host/modules.mjs` and, beside it, `./host/display.mjs`, `./http-policy.mjs`, `./local-services.mjs` directly (`git show fe9cac9a^:src/browser.mjs:2-11`). The comment's sentence is the Codex task's sentence; `git log -S` finds no earlier form. So every provider has been loaded on every page since the registry existed; the question of when was not raised in that commit.

### 1.3 `fe9cac9a` (2026-10-01 00:08, "Describe each host module with one manifest in its own directory")

Message: "The registry loads each provider from its manifest; build.sh, CMake, the sysroot, the constant generator, Pages packaging, the test server and the ABI tests read the manifests instead of ~15 hand-kept module lists." The eight static imports became (`host/modules.mjs:5-8`, unchanged since, `git blame`):

```
// This fixed registry is trusted embedding code. Images select no JS or Worker URLs:
// each module's provider is the file its manifest names.
const definitions = await Promise.all(hostManifests.map(async manifest =>
  ({ ...await import(new URL(manifest.host, manifest.url).href), contract: manifest })));
```

The second sentence was added here. The reason given is one list instead of fifteen; loading cost is not mentioned. `host/manifests.mjs:3-11` fixes the 18 names and imports each `module.json` (JSON module import) at load; `hostManifests` carries each manifest's `url`.

### 1.4 `3bda5a60` (2026-10-02, "Make the page shell module-agnostic")

"`src/browser.mjs` names no host module (376 -> 204 lines)". It added `selectBoot(route)` (`modules.mjs:20-30` today), which calls `module.boot?.(route)` on **every** definition before `createHost` (`src/browser.mjs:93`); only `host/snapshot/snapshot.mjs:12` exports `boot`. From this commit the page's boot needs every provider's module object, not only the declared ones.

### 1.5 `a182787a` (2026-10-13, `nena@0`)

Added to `modules.mjs`: `closed` (`:39`), `detach` (`:127-139`), `startProvider` with the 10 s acknowledgement timer (`:142-152`), `list`/`enable`/`disable` and `workerSwitch` (`:160-210`), the `host-switch` handling on the Worker (`:295-315`), the per-call `instances.has(owner)` closure for switchable imports (`:268-269`). `enable`'s check race was 5 s with a bare `setTimeout`; `7fb6514f` (2026-10-13, audit C6) gave it the `AbortController` form at `:185-188`. `65ea693b` (audit W1) limited the switches to the manifest with `switches` (`:105`). `42107686` (2026-10-13, "A loaded session boots without waiting long for its modules", audit W3, W6) added `restoreMilliseconds = 3000` (`host/nena/nena.mjs:16,104`): a session's re-enables race a 3 s timer inside the 10 s handshake, so W3 as the audit stated it ("A session that recorded `gpu@0` on a slow adapter fails to boot") is no longer the code; `test/nena-browser.mjs:211-219` loads a session with a never-answering adapter and asserts `ready`.

### 1.6 Was loading on demand considered?

- `tasks/20260930-100000-audit-24/TASK.md` ("Trusted browser code is too large and carries test-only surface", OPEN, priority 150). Its measurement of 2026-10-06 (`:133-141`, Chrome, boot and one command, before dso/input/sockets/pty/microphone/buttons/nena were modules): "71 scripts for `system`, 74 for `default`. The same 56 from the checkout either way, 7,180 lines and 326,806 bytes: every provider is imported whatever the image declares, so a `default` page loads the GPU, audio, build and upload providers it does not use." Step 4 of "Order proposed" (`:189-192`): "**Load a provider only when the image declares its module.** A `default` page would stop loading `host/gpu`, `audio`, `build`, `upload`, `download` and `snapshot`'s UI: what a reviewer of that page reads shrinks by more than any deletion here. Runtime-only; changes `host/modules.mjs`." The 2026-10-13 state lists it as left, item 4 (`:41`). Its wording predates `nena@0`: `default` now declares `upload`, `download` and `snapshot` (`Dollyfile:6,11,14`), so of its six only `gpu`, `audio` and `build` are still undeclared there.
- `tasks/20261001-000000-host-modules`, `tasks/20261012-230015-bridges`, `tasks/20260930-230823-static-frontend`: no line about when a provider is fetched. The static-frontend task's conclusion, "Classic static files at the right locations" (`:149`), and its finding that "`new Worker(new URL("./process-worker.mjs", import.meta.url), { type: "module" })` works" (`:79`) bear on form, not on count.
- `grep -rli "dynamic import\|lazy\|on demand\|import("` over `tasks/`, narrowed to host modules: nothing else.
- No owner statement on step 4 was found in tasks or commit messages.

### 1.7 Bundler, service worker, file lists, versions

- Bundler: `esbuild` 0.25.12 is a devDependency used by `scripts/bundle-process-worker.mjs` alone (`dist/dolly-process-worker.mjs` 9,302 B; `dist/dolly-process-dso.mjs` 58,842 B; "a process Worker bundle must have no external imports", `:20`). `terminal.html:125` does `await import(new URL("src/browser.mjs", assets).href)`; the page and the runtime Worker (`src/browser.mjs:145`, `type: "module"`) are unbundled ES modules: every `import … from` is one request, and a Worker has its own module map, so the Worker fetches its graph again.
- Service worker: `coi-serviceworker.js` (28 lines) adds COOP/COEP/CORP to same-origin responses and returns `fetch(event.request)`; it keeps no cache. Nothing in the tree uses `caches`, `modulepreload` or `<link rel=preload>` for scripts (`grep` over `*.html`, `*.mjs`).
- Caching: Cloudflare export writes `/:version/*` as `public, max-age=31536000, immutable` and the directories as `no-store` (`scripts/export-cloudflare-pages.mjs:62-65`); `npm run serve` sends `no-store` for everything (`scripts/serve.mjs:33,39`); "GitHub Pages sets its own caching" (`docs/deployment.md:175`).
- File lists: a release's `release/files.sha256` and a deployment's `deployment.sha256` are computed by hashing every file (`scripts/site-release.mjs:149-151,178-189`; `export-cloudflare-pages.mjs:111,131-133`), not hand-kept; a file in the tree is in them. `fe9cac9a` says Pages packaging reads the manifests; which fields pick `host/*.mjs` for packaging was not read in detail.
- Versions: `/vX.Y.Z/` per release (`src/version.mjs:3`, today `0.1.3`); "A published version never changes, so its files are immutable" (`export-cloudflare-pages.mjs:62`); the archive's versions enter each deployment as hard links (`:115-138`); a version leaves only when someone "remove[s] a published version explicitly" (`:87,161`); "a removed version stops loading" (`docs/deployment.md:172-173`).

## 2. What a page loads today

Method: the static closure of `import … from` lines, by file; `dynamic import()` excluded; bytes by `wc -c`. The page's own closure, `src/browser.mjs` without the providers (the registry, `manifests.mjs`, `requirements.mjs`, `host/abi.mjs` included): **21 files, 953,440 bytes**, of which `dist/dolly-images.mjs` is 844,735. The runtime Worker's own closure (`src/runtime-worker.mjs:31` imports the registry dynamically, after it starts listening: "the page's configure message may arrive while that import is still pending", `:18-19`): **22 files, 980,549 bytes**.

### 2.1 What the 18 providers add beyond the page's closure

| Module | Files | Bytes | Files (beyond the page's closure) |
| --- | --- | --- | --- |
| runtime | 7 | 61,590 | `runtime.mjs`, `src/process-supervisor.mjs` 37,898, `src/wasm-interface.mjs` 12,511, `src/process-abi.mjs`, `threads/threads.mjs`, `threads/abi.mjs`, `dist/dolly-process-abi.mjs` |
| display | 5 | 35,345 | `display.mjs` 16,396, `abi.mjs`, `src/kernel-plugin.mjs`, `src/wasm-interface.mjs`, `dist/dolly-kernel-plugin-abi.mjs` |
| input | 2 | 23,990 | `input.mjs` 23,089, `abi.mjs` |
| http | 5 | 32,616 | `http.mjs`, `broker.mjs` 13,054, `policy.mjs` 13,245, `local-services.mjs`, `abi.mjs` |
| gpu | 3 | 9,528 | `gpu.mjs` 5,358, `bridge.mjs` 2,055, `abi.mjs` (not `worker.mjs` 44,981) |
| audio | 4 | 13,102 | `audio.mjs`, `provider.mjs` 6,203, `abi.mjs`, `host/lease-bridge.mjs` 3,900 |
| microphone | 4 | 15,299 | `microphone.mjs`, `provider.mjs` 7,474, `abi.mjs`, `lease-bridge.mjs` (not `worklet.mjs` 795) |
| buttons | 4 | 13,952 | `buttons.mjs`, `provider.mjs` 5,241, `abi.mjs`, `lease-bridge.mjs` |
| download | 2 | 6,803 | `download.mjs`, `abi.mjs` |
| upload | 3 | 9,562 | `upload.mjs`, `transport.mjs` 7,028, `abi.mjs` |
| snapshot | 7 | 33,387 | `snapshot.mjs`, `transport.mjs`, `ui.mjs` 10,377, `abi.mjs`, `src/session-store.mjs` 8,882, `src/alphabetical.mjs`, `dist/dolly-build-id.mjs` |
| threads | 3 | 14,657 | `threads.mjs`, `abi.mjs`, `src/wasm-interface.mjs` |
| dso | 3 | 14,389 | `dso.mjs`, `abi.mjs`, `src/wasm-interface.mjs` (not `process.mjs`/`ffi.mjs`: bundled, served to dso executables' Workers) |
| sockets | 2 | 1,007 | `sockets.mjs` 139, `abi.mjs` |
| pty | 2 | 632 | `pty.mjs` 163, `abi.mjs` |
| build | 1 | 764 | `build.mjs` (not `ui.mjs`, `service.mjs`) |
| packages | 2 | 3,454 | `packages.mjs`, `service.mjs` |
| nena | 4 | 14,419 | `nena.mjs` 7,592, `abi.mjs`, `lease-bridge.mjs`, `runtime/boot-files.mjs` |

Shared between providers: `src/wasm-interface.mjs` (4), `host/lease-bridge.mjs` (4), `threads/threads.mjs` and `threads/abi.mjs` (runtime and threads). Union: **55 files, 253,117 bytes** (46 `host/`, 6 `src/`, 3 `dist/`), plus the **18 `module.json`, 7,168 bytes**.

### 2.2 By page

| Page | Declared modules | Page: JS requests, bytes | Of them not declared: files, bytes | Worker: not declared |
| --- | --- | --- | --- | --- |
| `default` (`Dollyfile:3-14`: runtime, display, input, download, dso, http, nena, packages, snapshot, sockets, threads, upload) | 12 | 76 JS (1,206,557) + 18 JSON (7,168) = 94 requests | 15 files, 41,577 B: gpu 3 (9,528), audio 3 (9,202), microphone 3 (11,399), buttons 3 (10,052), build 1 (764), pty 2 (632) | the same 15, 41,577 B |
| `system` (`Dollyfile-system:3-9`: runtime, display, input, download, http, snapshot, upload) | 7 | same 94 | 25 files, 62,335 B | not computed separately |
| an image with all 18 | 18 | same 94 | 0 | 0 |
| menu (`index.html` from `menu.html`) | none | 0 scripts (`grep -c "<script"`: 0 in both) | | |

Of the page's 1,206,557 JavaScript bytes, 845,494 are generated `dist/` modules (`dolly-images.mjs` 844,735 and four stubs); checkout code is 361,063 bytes. The runtime Worker: 69 JS + 18 JSON = 87 requests, 1,175,510 bytes; 67 URLs are the same as the page's. Process Workers load the bundle only. No image in the catalog declares all 18; the most is 12 (`Dollyfile`, `demos/tmux/Dollyfile-tmux-panes`, `demos/studio/Dollyfile-dollyfile-studio`). Declaring counts over 130 recipes: gpu 10, audio 4, microphone 5, buttons 3, build 1, pty 2, nena 2.

### 2.3 What is imported at load and what only on use

Loaded with the provider (static imports, the table above). Loaded only on use:

- `host/gpu/worker.mjs` (699 lines, 44,981 B): `createGpuBridge` does `new Worker(new URL("./worker.mjs", import.meta.url))` (`host/gpu/bridge.mjs:5`), called from the Worker side's `start()` (`host/gpu/gpu.mjs:104-107`): fetched when `gpu@0` starts, in an image that declares it or after `nena enable gpu`.
- `host/build/ui.mjs` (and through it `src/image-builder.mjs`, `image-build.mjs`, `custom-image.mjs`, `build/service.mjs`): `const ui = import("./ui.mjs")` inside `browser()` (`host/build/build.mjs:8`), with the reason "a static import would cycle back into the host registry through the image builder" (`:6-7`).
- `host/microphone/worklet.mjs`: `audioWorklet.addModule(new URL("./worklet.mjs", import.meta.url))` at OPEN (`host/microphone/provider.mjs:42`).
- `dist/dolly-process-dso.mjs` and `dolly-dso-0.wasm`: fetched in `dso@0`'s Worker `start()` (`host/dso/dso.mjs:10-14`); `test/host-modules-browser.mjs:20,114` already counts that fetch and asserts an image without `dso@0` makes none.
- `host/snapshot/ui.mjs:111`: a metadata module `import()` at save.

### 2.4 What importing a provider does

Top-level statements in the 18 entry files and what they import: `import`, `export`, `function`, `class`, and `const` initialised with `new TextEncoder`/`TextDecoder` (nine files), `new Set`/`new Map` (`http/policy.mjs:8,22`; `dso/ffi.mjs:38`), `new Uint8Array` (`input/input.mjs:7`), an arrow `readClipboard = async () => navigator.clipboard.readText()` defined, not called (`buttons/buttons.mjs:12`). Grep for top-level lines naming `document`, `navigator`, `window`, `location`, `globalThis`, `addEventListener`: none besides that arrow. `location.href` is read inside `boot(route)` (`snapshot.mjs:15`), the HTTP policy is consumed inside `browser()` (`http.mjs:43`), `navigator.gpu.requestAdapter` inside `check()` (`gpu.mjs:16`), `getUserMedia` inside the provider at OPEN (`microphone/provider.mjs:39` per the audit). The two files with top-level side effects, `gpu/worker.mjs:659` (`self.onmessage =`) and `microphone/worklet.mjs:19` (`registerProcessor`), are Worker and worklet scripts, never imported by the page. The registry's own load-time work: the owners loop (`modules.mjs:33-36`). So an imported provider that is not enabled holds module-scope constants and function objects; it has touched nothing of the page.

## 3. The audit's claims, checked

- "Every provider is imported on every page (`modules.mjs:7-8`), 18 `host` files whether or not the image can use them." True for "every provider" and the line; "18 files" is the count of entry files. The entry files pull 46 `host/` files, 6 `src/` and 3 `dist/` (55), plus 18 `module.json`. Measured against the image's need: `default` 15 of 55 unneeded, `system` 25.
- "a `default` page then loads no GPU, audio, microphone or buttons code": `default` declares none of the four (`Dollyfile:3-14`), nor `build@0`, `pty@0`. It declares `nena@0`, so any of the six may be enabled later (`docs/browser-boundary.md:88-95`), and a saved session's `/etc/dolly/enabled` re-enables them at load (`nena.mjs:92-104`).
- "`enable()` already has the await for it": `enable` is `serially(async () => …)` (`:172`). It takes `module` from `byName` at `:173`; `:174-179` read manifest fields only (`contract.version`, `fixed`, `dependencies`); the provider object is first used at `:186` (`module.check`), then `attach` (`:190`, which calls `module[side]` at `:102`), `workerSwitch` (`:192`), `entryStarted` (`:194`). The Worker's side reaches `attach` through `handle("host-switch")` (`:299-307`) on its own registry instance.
- "cheap": the audit gives no count. Lines in `modules.mjs` that touch a provider object rather than its manifest: `:7-8` (import), `:23` (`boot`), `:93` and `:186` (`check`), `:102` (`browser`/`worker`), `:240` and `:306` (`digest`). Lines touching the manifest only: `:9`, `:13-14`, `:31-36`, `:63-64`, `:83-84`, `:88-90`, `:97`, `:105`, `:161-163`, `:174-179`, `:203-205`, `:268`, `:330`. Who else imports the registry: `src/browser.mjs`, `src/runtime-worker.mjs`, `src/image-builder.mjs` (a build host), and tests `test/audio-browser.mjs`, `dolly.artifacts.mjs`, `fixtures/browser-boundary.mjs`, `host-compute-browser.mjs`, `microphone-browser.mjs`, `host-modules.test.mjs`. `test/host-modules.test.mjs` imports `hostManifests`, not the registry, and reaches each module's `abi.mjs` and `processWorker` directly (`:124,131`).

## 4. What a change would mean, on real cases

(a) **`default`'s first load.** 15 fewer of 94 page requests and 41,577 of 1,213,725 bytes (3.4 %); against checkout code 11.5 %; against the whole first load (snapshot 14,307,460 B as four packs under `dist/packs/`, font 1,074,932 B, `dolly.wasm` 213,424 B, JavaScript 1.21 MB: about 16.8 MB) 0.25 %. The Worker side saves the same 15 again. `dolly.data` (107,932,517 B) is fetched on a rebuild only (`runtime-worker.mjs:149`).

(b) **`nena enable gpu` in a session.** Today the provider is in memory; the switch waits for `check()` under the 5 s race (`:185-188`; `test/nena-browser.mjs:203-207` shows a 6 s adapter refused), then the Worker's `start` under the 10 s handshake (`:148`), which for gpu includes the Worker's `new Worker(worker.mjs)` fetch and its own 10 s timer (`bridge.mjs:10`). An import at enable would add one fetch of 3 files (9,528 B) on the page and 3 on the Worker before or inside those windows. Offline: the fetch fails unless cached; on Cloudflare the file is `immutable` for a year once fetched, which an unfetched file never was. A site version replaced while a tab is open: the tab's `/vX.Y.Z/` files stay published and unchanged (hard-linked archive) until that version is removed explicitly; after removal a late `import()` 404s while already-imported code goes on. A loaded session's re-enables run under the 3 s `restoreMilliseconds` (`nena.mjs:16,104`): a module whose import plus check plus start passes 3 s "comes while the session runs" (`:92-96`).

(c) **The Worker side.** `src/runtime-worker.mjs:31` imports the same registry, so the Worker imports all 18 providers too (69 JS + 18 JSON). Its `attach` for a `host-switch` (`:302`) and its `start(phase)` (`:326-332`) use `module[side]` and `instance.start`; the Worker would need its own conditional import at the same points, with no `check()` on that side (`:92`).

(d) **The registry's load-time checks.** Manifest only: `hostContracts` (`:9`), `runtimes` (`manifests.mjs:15-16`), `byName` keys, the duplicate-owner loop (`:33-36`), `fixed`, `switches`, `provides`, `dependencies`, `phase`, and the whole of `test/host-modules.test.mjs`. Needing the provider's module object today: `selectBoot` (`:20-30`), run on every definition at page boot before any module is enabled (only `snapshot.mjs:12` exports `boot`); `module.digest` in `admit` (`:240`) and `host-switch` (`:306`), where `digest` is a re-export of the module's `abi.mjs` (`DOLLY_NAME_ABI_DIGEST`, e.g. `host/gpu/gpu.mjs:5`), and `admit` is called for declared modules a build host does not enable (`runtime-worker.mjs:113-115`, "A declared module this host does not enable (a build host) answers its calls with ENOSYS", `modules.mjs:234-235`), so a digest can be wanted for a provider that is not attached; and `check()`/`browser()`/`worker()` themselves.

(e) **An embedding's `DOLLY_HOST_MODULES`.** It replaces the created set and sets `closed` (`src/browser.mjs:116,122`; `modules.mjs:177`); today it bounds what is attached and what `nena` may enable, not what is fetched. Under on-demand loading its list would also be the fetch list; `host.require(requiredHost)` (`:139`) stays the recipe's check either way.

(f) **The review question.** Today: one line, `:7-8`, one `import()` whose argument is `new URL(manifest.host, manifest.url)` from the 18 frozen manifests (`manifests.mjs:3-11`), and every file a page can run is in memory on every page; "which trusted code can run on this page" is answered by the manifests' `host` fields and is the same on every page. With the import moved: the same expression, the same 18 possible files, the same assertion at `:5-6`, but what a page *does* load becomes the image's list plus its session's switches, and a reviewer reading one page's network log sees fewer files, while reading the source must follow the import into `attach`/`enable` on both sides. The review map names code by module, not by page (`docs/browser-boundary.md:55-58`, the table's "Code" column); `audit-24`'s step 4 put the gain as "what a reviewer of that page reads shrinks".

## 5. What could not be found out by reading

- The time a late import adds on a slow connection, or whether the browser's HTTP cache serves the Worker's second fetch of the 67 shared URLs without a request (browser behaviour, host headers; `no-store` locally).
- Whether module preloading would matter: the tree has no `modulepreload`, and the 2026-10-06 Chrome measurement (`audit-24:133-141`) predates seven of today's modules.
- The compressed size of `default`'s packs (the metadata's `byteLength` fields sum to the uncompressed 14,307,460).
- Which manifest fields Pages packaging uses to select `host/*.mjs`.
- Any owner statement on `audit-24` step 4, or any reason beyond "one list instead of fifteen" (`fe9cac9a`) for importing at load rather than at enable.