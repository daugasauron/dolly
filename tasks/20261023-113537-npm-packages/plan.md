# Plan: Dolly as npm packages — a minimal core and `default` with Ghostty's terminal

Read-only planning on `main` `0f9fff84` (v0.1.3). Every size below was measured on 2026-10-23 in `/home/daug/dev/dolly/work/x11fix/dist/` (same commit, all 159 images built) unless marked *inferred*. Per the owner's later word, this plan says nothing about version numbering and plans for no bundler: the packages are plain ES modules, Workers and `.wasm` files that a consumer serves from its own server.

## 0. The shape in one paragraph

Two npm packages, both assembled by a script from a sealed release, never from the checkout: **`@slopshare/dolly`** (the core: kernel, process runtime, every host-module provider, the page code, no image, 132 files, 795 KB raw / ~266 KB compressed) and **`@slopshare/dolly-default`** (the `default` image's packs, metadata and recipes, 4.9 MB compressed, of which Ghostty's plugin and its font are 59%). A consumer serves both directories as they are, sends the two isolation headers, and calls `boot(element, { image })`. A package is a subset of the sealed release at the files' checkout paths, so site and packages share one layout and one set of code; the only code change of substance is that the core learns to find an image's files in a directory other than its own.

## 1. Names and contents

### Names

| Name | Registry state (measured 2026-10-23) | Decision |
| --- | --- | --- |
| `dolly` | taken: 0.0.3, 2022, a Three.js helper (maintainer brianchirls) | not available |
| `dolly-core`, `dolly-wasm`, `dolly-runtime`, `dolly-browser`, `dollyos`, `slopshare` | 404 (free) | unscoped names say nothing about whose Dolly this is |
| `@slopshare/*` | scope holds no package (`registry.npmjs.org/-/v1/search?text=scope:slopshare` returns 0) | **use it**: the site is slopshare.dev |

**`@slopshare/dolly`** for the core and **`@slopshare/dolly-default`** for the image, matching `dist/dolly-IMAGE-system.snapshot`, so a later `dolly-system` needs no new convention. Whether an npm user or org named `slopshare` already exists could not be checked here (npmjs.com answers 403 to scripted requests, the registry's user endpoint 401); the owner creates the org at npmjs.com/org/create, which settles it in a minute. npm's publish documentation states no tarball size limit (fetched 2026-10-23); both tarballs are small anyway.

### `@slopshare/dolly` (core): 132 files, 795,298 B raw, 266,345 B gzipped file by file

| Directory | Files | Bytes | What |
| --- | ---: | ---: | --- |
| `src/*.mjs` | 24 | 173,629 | the closure of `src/browser.mjs` and `src/runtime-worker.mjs` plus what the providers import (`kernel-plugin.mjs`, `session-store.mjs`); `src/process-worker.mjs` ships only as its bundle |
| `host/**` | 76 | 317,818 | 18 `module.json` and 58 `.mjs`: every provider, because `host/manifests.mjs:3-8` and `host/modules.mjs:7-8` import all of them at load and `nena@0` may enable any; no `.c`, `.h`, `.wat` |
| `dist/dolly.wasm` | 1 | 216,588 | the kernel |
| `dist/dolly-*-0.wasm` | 25 | ~15,000 | the compiled contracts the supervisor, loader and plugin linker read (`src/process-supervisor.mjs:150-157`, `host/dso/dso.mjs:10-16`) |
| `dist/dolly-process-worker.mjs`, `dist/dolly-process-dso.mjs` | 2 | 72,471 | the bundled process Worker and dso's in-process bundle |
| `dist/dolly-{process,kernel-plugin,threads}-abi.mjs`, `dist/dolly-build-id.mjs`, `dist/dolly-image-build-id.mjs` | 5 | ~870 | digests and the runtime's identity |
| `package.json`, `LICENSE`, `README.md` | 3 | small | `"exports": "./src/browser.mjs"`; the README is the embedding guide |

Left out, with the measured reason: `dist/dolly.data` (the seed, 107,907,302 B: only a root rebuild loads it, `src/runtime-worker.mjs:149-153`); `dist/IosevkaTerm-SemiBold.woff2` (1,074,932 B: it styles the page's boot log only; the terminal's font is inside the display snapshot); `coi-serviceworker.js` (a service worker under `node_modules/` cannot control the consumer's page above it, so the fallback is useless in a package); `dist/dolly-images.mjs` (the image registry is image-side, see 7); every HTML page; `dist/static/`, `abi/*.wat`, `host/*/*.wat` (published for recipes and docs, never loaded by the page).

### `@slopshare/dolly-default`: 4,879,489 B compressed (measured sum)

| Files | Count | Bytes | Why the page needs them |
| --- | ---: | ---: | --- |
| `dist/packs/HASH.snapshot.gz` | 4 | 4,760,343 | `default`'s snapshot (14,597,255 B raw, 220 files) as its shared packs; fetched by `src/image-artifact.mjs:108-126` |
| `dist/dolly-IMAGE-system-snapshot.mjs` for the 16 images of `default`'s closure | 16 | 605,129 raw (~100 KB gz) | `loadPackagedSnapshotMetadata` walks every `artifacts` row recursively (`src/image-artifact.mjs:93-101`), so `ghostty-build` (173,765), `zig-build` (171,088), `system-tools` (112,292) and `system-build` (101,486) metadata are read although their packs are not |
| `Dollyfile`, `Dollyfile-{amy,core,curl,display,ghostty-build,git,gzip,nena,posix,ps,system-build,system-tools,transfer,zig-build,zlib}` | 16 | 61,654 | `verifyVisibleRecipes` fetches each recipe at its site path and checks its pin (`src/image-artifact.mjs:23-34, 102`) |
| `dist/dolly-images.mjs` | 1 | 36,076 | the registry generated for this closure alone (`imageRegistrySource` with `DOLLY_BUILD_IMAGES=default`, no static sources; measured) |
| `amy-index.txt` | 1 | ~1 KB | the 8 packages this tarball holds, so `amy list` shows them installed and `amy install X` fails by name rather than with a 502 |
| `index.mjs` | 1 | 2 lines | `export const image = { name: "default", base: new URL("./", import.meta.url) };` |
| `package.json`, `LICENSE`, `README.md` | 3 | small | `peerDependencies: { "@slopshare/dolly": "X.Y.Z" }` exact: metadata `buildId` must equal the core's `DOLLY_IMAGE_BUILD_ID` (`src/image-artifact.mjs:51`) and the recipes' site paths its `DOLLY_VERSION` (`src/static-asset.mjs:30-36`) |

Where `default`'s bytes go (measured): `/usr/share/fonts/IosevkaTerm-SemiBold.ttf` 7,699,492 and `/usr/lib/libdisplay.so` 1,860,486, i.e. the `display` package is 9,630,897 of 14,597,255 raw and 2,802,098 of 4,760,343 compressed. The other seven packages: `posix` 3,375,167 / 1,369,659 gz, `core` 1,001,715 / 371,025, `curl` 426,860 / 115,986, `amy` 239,028 / 86,605, `transfer` 109,027 / 26,458, `nena` 84,331 / 26,483, `ps` 3,662 / 828.

**Do the numbers argue for another cut?** No. The terminal is 59% of the tarball, but an image opens only with ENTRY and `display@0` (`docs/dollyfile.md:255-256`, `scripts/generate-routes.mjs:38-39`), so a "default without Ghostty" package could boot nothing; and 4.9 MB needs no CDN. The `core` image (1.0 MB raw) is a `PACKAGE` with no ENTRY, so a core-only embedder cannot boot it either; what such an embedder has instead is section 2.

## 2. What "minimal core" means concretely

- **Kernel and process runtime**: `dist/dolly.wasm`, the contracts, the process Worker bundle, the supervisor (`src/process-supervisor.mjs`), the runtime Worker (`src/runtime-worker.mjs`).
- **Host modules**: all 18 providers ship; which are *enabled* is decided per boot exactly as today: the image's `REQUIRES HOST` list, or the embedding's `hostModules` list (`src/browser.mjs:116-124`), checked before ENTRY by `host.require` (`src/browser.mjs:139`, `host/modules.mjs:60-67`).
- **Page code**: `boot(element, options)` in `src/browser.mjs` (today's body with its five `querySelector` lookups at lines 14-17 and 73 replaced by elements it creates inside `element`, its top-level `boot().catch` at 232-236 removed, and the `__dolly` handle of lines 225-229 returned instead of assigned).
- **Image**: none. The consumer names one: `image: { name, base }`, where `base` is a directory served on the same origin holding what `npm run image -- NAME` writes to `dist/` plus the recipes of NAME's closure, that is a subset of a release. `@slopshare/dolly-default` is one such directory.
- **No terminal.** `display@0` cannot start without the Ghostty plugin: `host/display/kernel.c:175-189` reads `DISPLAY` (set by `Dollyfile-display:30`) and fails without the file; the terminal's key decoding is the plugin's too (`docs/display.md:54-56`). What a core-only embedding gets today without any change:
  - the ENTRY program's terminal output as text: with no display attached the kernel routes terminal writes to `dolly_bootstrap_write_bytes` (`src/dolly.c:213-219`), which the page appends to its log (`src/browser.mjs:158-161`);
  - Ctrl+C and the shell's results through the terminal mailbox (`host/runtime/runtime.mjs:19-66`, `handle.terminal.interruptForeground()`), the exit status (`exited` message, `src/runtime-worker.mjs:315-319`), and every module without a surface: `http@0` under the embedding's policy, `threads@0`, `dso@0`, `sockets@0`, `pty@0`, `gpu@0` compute;
  - no keyboard input: records enter only through `input@0`, decoded by the plugin.
  
  The precedent is `test/host-compute-browser.mjs:23-46`, which boots `runtime@0`, `gpu@0`, `http@0` with no canvas and interrupts a shell loop. So the core alone is a runtime for programs that run to completion or draw their own frames; interactive use needs an image that installs the `display` package, which is what `dolly-default` is.

## 3. The embedding API

```html
<div id="dolly" style="height:100vh"></div>
<script type="module">
  import { boot } from "./node_modules/@slopshare/dolly/src/browser.mjs";
  import { image } from "./node_modules/@slopshare/dolly-default/index.mjs";
  const dolly = await boot(document.querySelector("#dolly"), {
    image,                                   // { name, base }
    http: { policy: { maxRequests: 64, rules: [] }, relays: [] },   // omit for the open default
  });
  console.log(await dolly.submit("echo hello"));                     // 0
</script>
```

Bare specifiers do not resolve in a browser without a bundler, so the consumer imports by URL; this is the README's example and the one the npm test runs verbatim (section 6).

| Today | In `boot()` | Status |
| --- | --- | --- |
| `globalThis.DOLLY_BOOT = { image, mode, loadSession }` (`terminal.html:114`, read at `src/browser.mjs:82-89`) | `options.image = { name, base }`, `options.mode` (`"snapshot"` default; `"rebuild"` keeps working for the site and fails explicitly in a package, since `image.base` has no `dist/dolly.data`), `options.session` (boolean: restore the session named by the page's `?name=`, as `host/snapshot/snapshot.mjs:12-16` reads it) | renamed; the site's `terminal.html` keeps writing `DOLLY_BOOT` and passes it on |
| `globalThis.DOLLY_HOST_MODULES` (`src/browser.mjs:116-124`) | `options.hostModules`; given, the embedding is `closed` and `nena@0` enables nothing outside it (`host/modules.mjs:177`) | renamed; `terminal.html` still reads the global so `test/host-modules-browser.mjs:8`, `test/threads-browser.mjs:11`, `test/nena-browser.mjs:260` and `docs/browser-boundary.md:86-87, 110-112` stay true |
| `globalThis.DOLLY_HTTP_POLICY`, `DOLLY_HTTP_RELAYS` consumed once by `host/http/http.mjs:43` via `consumeDollyHttpPolicy(window, …)` (`host/http/policy.mjs:256-265`) | `options.http = { policy, relays }`, handed to the http provider as its `configuration` and consumed once there; `consumeDollyHttpPolicy` already takes the object it reads from, so `terminal.html` passes `{ DOLLY_HTTP_POLICY, DOLLY_HTTP_RELAYS }` from the globals and deletes them | renamed for embeddings; globals kept for the site page and the 15 tests that set them with `addInitScript` |
| `window.__dolly` (`src/browser.mjs:225-229`) | the value `boot()` resolves to: `submit`, `visibleTerminalText`, `terminal`, `hostModules`, the modules' members (`docs/browser-boundary.md:221-246`); `terminal.html` assigns it to `window.__dolly` for the tests and the site's checks | returned, not global |
| `#terminal`, `#display`, `#keyboard`, `#bootstrap-log`, `#session-status` in `terminal.html` | created by `boot()` inside `element` with the same ids and inline styles (as `ended()` already styles its notice, `src/browser.mjs:58-62`); `#image-ended` appended to `element` instead of `body` | private to the page code; providers keep receiving them as `mount`, `canvas`, `keyboard` (`host/display/display.mjs:254`, `host/input/input.mjs:276`) |
| links the snapshot module builds to the site's pages: `sessions/` (`host/snapshot/ui.mjs:99`) and `session/?name=` (`host/snapshot/snapshot.mjs:47-48`) | one resource `sessionPages: { list: URL, open(name): URL }` that `terminal.html` passes with today's `publicURL` values; absent, the dialog omits the list link and the ended notice omits "Open saved session" | the only new option besides the renames |
| `document.documentElement.dataset.dollyStatus`, F11 and Ctrl+Shift+F (`src/page-chords.mjs`) | unchanged | the tests wait on the attribute (`test/browser.mjs:33`) |

The browser authority rules hold: the module set and the HTTP policy are still chosen by trusted page JavaScript before the Worker exists and are consumed once (`docs/browser-boundary.md:160-161`); nothing of them comes from Wasm, the registry file or a URL the guest names; `nena@0` is bounded by `closed` exactly as now. Private and unchanged: the `configure` message and the Worker protocol, `createHost`, the providers' interfaces.

## 4. Getting the bytes to the browser

**Inside the tarballs.** The default package is 4.9 MB; fetching images from slopshare.dev or a CDN instead would need those hosts to send CORP/CORS headers acceptable under `require-corp`, a rule for them in every embedding's policy, and a second trust path for the broker's site-path resolution (`host/http/broker.mjs:51-58` resolves `/vX.Y.Z/FILE` only against the serving site's root). None of that is worth 4.9 MB. Larger images (`system` is 43,216,034 B compressed in 23 packs) are not packages: a consumer serves the image directory `npm run image -- NAME` produces and passes it as `image.base`.

**What a consumer's server must do** (the README's "Serving" section, checked by the npm test):

- Serve both package directories whole, unmoved: the core locates its own files relative to `import.meta.url` (`src/browser.mjs:144`, `src/runtime-worker.mjs:49-54`, `host/gpu/bridge.mjs:5`, `host/microphone/provider.mjs:42`, and `../../src/` imports throughout `host/`), process Workers come from a Blob URL (`src/process-supervisor.mjs:162`), and the image's files are found under `image.base` (section 7).
- `Content-Type: application/wasm` for `.wasm` (`WebAssembly.compileStreaming(fetch(…))`, `src/runtime-worker.mjs:141`, refuses anything else) and `text/javascript` for `.mjs`; `scripts/serve.mjs:10-28` is the list.
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on the page's response (sending them on every response is simplest); `Cross-Origin-Resource-Policy: same-origin` on the files is fine since everything is same-origin.
- A CSP, if any, allows `worker-src 'self' blob:` and `wasm-unsafe-eval`.

**How the package checks it.** `boot()` throws before loading anything when `!crossOriginIsolated`, naming the two headers (today `terminal.html:116-141` does this and falls back to the service worker; the package has no fallback); `host/runtime/runtime.mjs:7-12` refuses again in `check()`. The npm test opens the consumer app once without the headers and asserts that message.

## 6. Build and verification

**`scripts/package-npm.mjs RELEASE OUT`** (new, ~150 lines): takes a sealed release (`RELEASES/current`, verified with the existing `verifyRelease` of `scripts/site-release.mjs:162`), copies the two file sets of section 1 at their checkout paths, writes each `package.json` with the version read from the release's `src/version.mjs` as `scripts/export-static.mjs:28` does, regenerates `dist/dolly-images.mjs` for `default`'s closure with `imageRegistrySource` (`scripts/image-definitions.mjs:143-158`) over `selectImageDefinitions(…, "default")` (`:40-69`) and `amy-index.txt` for the shipped packages, runs `npm pack` in each, and writes `OUT/npm.sha256`. It refuses an existing `OUT` and uploads nothing, like the exporters.

**`test/npm-packaging.test.mjs`** (Node, in `npm run test:source`): the tarballs' file lists equal the planned sets exactly (no `.c`, `.h`, `.wat`, `.html`, `dolly.data`, `woff2`); the metadata and recipe sets are the closure the registry names; sizes are printed.

**`test/npm-browser.mjs`** (real browsers, as the project rule demands): in a temporary directory, `npm install --no-audit --no-fund OUT/*.tgz`; write the README's `index.html` verbatim; serve the directory with `isolationHeaders` and `mimeTypes` from `scripts/serve.mjs:10-34`; launch Chromium and Firefox as `test/browser.mjs:85-91` does. Checks:

1. `dolly-default`: `data-dolly-status` reaches `ready`; the shell prompt is drawn (Ghostty's RGBA frame, `dataset.terminal === "ghostty-rgba-wasm"`); `submit("echo npm-ok")` is 0 and the text is on screen; `hostModules` are `default`'s twelve; under `http.policy` with no rules, `curl https://example.com` fails with `EACCES` (policy set outside Wasm); Ctrl+Shift+S saves and the Save dialog shows no list link.
2. `dolly` alone: a display-less image (built in the test as `test/host-compute-browser.mjs:47-65` builds one, ENTRY `/bin/slop -c 'echo core-ok'`), served from a directory beside the app, boots with `hostModules: ["runtime@0", "http@0"]`, prints `core-ok` to the log and exits 0; no `canvas` exists.
3. The page served without COOP/COEP fails with the message naming the headers; a `.wasm` served as `application/octet-stream` fails naming the file.

**Release checklist** (`scripts/release-checklist.sh`, `docs/deployment.md` "Release"): after step 3 (both sites sealed and accepted, `:38-41`) a step 3b packages npm from the domain release and runs `test/npm-browser.mjs`; step 5 attaches the two tarballs to the GitHub release and the printed commands (`:60-75`) gain `npm publish OUT/slopshare-dolly-*.tgz --access public`, the owner's act, never run by the script; step 7 adds `npm view @slopshare/dolly dist.shasum` against `OUT/npm.sha256`.

## 7. What changes in the repo

**Nothing moves.** The packages are subsets of the release at checkout paths, so `scripts/package-pages.sh:50-52, 61-79` and the site are untouched by the file layout.

**Code that changes** (all page or Worker JavaScript, all under `src/*.mjs` and `host/**/*.mjs`, none an image input):

| Change | Files and lines | Why |
| --- | --- | --- |
| `boot(element, options)` | `src/browser.mjs` (14-21, 73, 82-124, 225-238), `terminal.html` (114-141) | sections 2 and 3 |
| policy and relays from configuration | `host/http/http.mjs:40-52` (`consumeDollyHttpPolicy(configuration.embedding ?? window, …)`) | section 3; `host/http/policy.mjs` unchanged |
| image files found under `image.base`, not the core's directory | static `../dist/dolly-images.mjs` imports in `src/browser.mjs:11`, `src/image-builder.mjs:2`, `src/image-build.mjs:1`, `src/source-download.mjs:1`, `src/image-artifact.mjs:2`, `src/runtime-worker.mjs:4`, `host/packages/service.mjs:1`, `host/snapshot/snapshot.mjs:5`, `host/snapshot/ui.mjs:3, 112` become one `await import(new URL("dist/dolly-images.mjs", image.base))` in `boot()` and in the Worker (from the `configure` message), handed down as a value; image URLs in `src/image-artifact.mjs:9, 25, 40-42, 115-116`, `src/image-build.mjs:8, 14` and `publicURL` (`src/static-asset.mjs:39-43`, whose `_dolly/` strip is dead since `17793187`) take the image base; runtime URLs (`src/runtime-worker.mjs:49-54`, `src/process-supervisor.mjs:150-157`, `host/dso/dso.mjs:10-16`) keep the core's | two packages, two directories; on the site both bases are `/vX.Y.Z/` |
| session page links as a resource | `host/snapshot/ui.mjs:99`, `host/snapshot/snapshot.mjs:47-48`, `terminal.html` | section 3 |
| new | `scripts/package-npm.mjs`, `test/npm-packaging.test.mjs`, `test/npm-browser.mjs`, two lines in `scripts/release-checklist.sh`, `package.json` scripts `package:npm` and `test:npm` | section 6 |
| docs (unpinned) | `README.md` "Embed" section; `docs/deployment.md` "npm packages" and the checklist steps | neither is pinned by `Dollyfile-dolly-docs` |

**Deleted because the packages replace it:** nothing yet. `publicURL`'s dead `_dolly/` regexp goes with the base change (recorded in `tasks/20260930-100000-audit-24`). `coi-serviceworker.js` stays for GitHub Pages.

**Must not change, and does not:** the seed inputs (`include/`, `host/*/*.h`, `host/*/client.c`, `host/*/*.wat`, `src/slop.c`, `src/dollyfile.c`, `src/commands/`, `src/process/`, `src/ghostty/display.c`, `toolchain/`), every `Dollyfile*` and its pins, kernel C, and the 13 documents and 25 contracts `Dollyfile-dolly-docs` pins (`docs/browser-boundary.md`, `docs/sessions.md`, `docs/dollyfile.md`, `docs/architecture.md`, `docs/display.md`, `docs/http.md`, … and `host/README.md`), whose edit would re-pin `dolly-docs` and rebuild `pi-agent` (its one installer). `docs/browser-boundary.md`'s sentences about `DOLLY_HOST_MODULES` stay true because the site page keeps honouring it.

**Blast radius:** every step below is 0 image rebuilds and 0 runtime rebuilds; verification is `npm run test:source` (20 s) and the browser suites named per step (24-68 s per suite per browser, README's table).

## 8. Steps

| # | Step | Verification (both browsers) | Cost |
| --- | --- | --- | --- |
| 1 | `boot(element, options)` in `src/browser.mjs`; `terminal.html` calls it, assigns `window.__dolly`, keeps the globals | `test/core-browser.mjs`, `default-browser.mjs`, `host-modules-browser.mjs`, `nena-browser.mjs`, `ending-browser.mjs` | half a day; 0 rebuilds |
| 2 | HTTP policy and relays through the http provider's configuration | `test/http-policy.test.mjs`, `network-browser.mjs`, `custom-session-browser.mjs` (inherited policies) | 2 hours; 0 |
| 3 | Image base: registry by URL, image files under `image.base`, `publicURL` takes a base | core suite, `site-browser.mjs` (two prefixes on one origin), `amy-browser.mjs` (`packages@0` reads the registry), `image-browser.mjs`, `session-offline-browser.mjs` | one day; 0 |
| 4 | `sessionPages` resource; links omitted when absent | `session-offline-browser.mjs`, `ending-browser.mjs` | 2 hours; 0 |
| 5 | `scripts/package-npm.mjs` and `test/npm-packaging.test.mjs`, run against the sealed v0.1.3 release in `work/x11fix/build/v013-domain-releases/current`; file lists and sizes compared with section 1 | `npm run test:source`; `npm pack --dry-run` listings | half a day; 0 |
| 6 | `test/npm-browser.mjs`: the throwaway consumer app, the three checks of section 6 | the test itself in Chromium and Firefox (about 2 minutes, inferred from `default-browser.mjs`) | one day; 0 |
| 7 | README "Embed" and "Serving", `docs/deployment.md`, checklist step 3b and the publish command, `package.json` scripts; first publish rides the next release by the checklist | `node --test test/package-documentation.test.mjs`; the checklist's dry run on the stand-in release | 2 hours; 0 |

Steps 1-4 each leave the site working and tested; 5-7 depend on 3. Each row is one task.

## 9. Risks and what could not be found out

- **The `slopshare` npm name.** Not verifiable from here (403/401); if an org by that name exists and is not the owner's, `@slopshare-dev/` is the fallback and nothing else in the plan changes.
- **`amy install` inside the package.** Only the eight shipped packages resolve; `amy install cc` fails with "This release publishes no package with that recipe pin" (`host/packages/service.mjs:33-35`), since the index is read as a site path of the serving root (`src/commands/amy.c:25`, `host/http/broker.mjs:51-58`). The README says the catalog is the site's; a consumer who wants it serves an image directory with more packages as `image.base`. Serving the catalog cross-origin is a separate design.
- **Consumer misconfiguration.** A wrong `.wasm` MIME type or missing headers fails with an explicit message, but only in the browser; the npm test proves the messages, not a consumer's server. A strict CSP without `blob:` breaks process Workers (`src/process-supervisor.mjs:162`); the README names it.
- **Ancestor metadata in the default tarball** (605 KB raw) exists because the page verifies the whole input chain (`src/image-artifact.mjs:93-101`). Leaving it is cheap; stopping the walk at packages is trust code and not this plan's.
- **Pairing.** A `dolly-default` installed against another core build fails at boot, explicitly (`src/image-artifact.mjs:64`, `src/static-asset.mjs:33`); the exact `peerDependencies` is the only guard, and `npm install` only warns on a mismatch.
- **Not measured:** the npm test's wall time, the boot time of `default` from `node_modules/` in Firefox, and whether headless Firefox needs any preference beyond those `test/browser.mjs:89-90` sets to run Ghostty's canvas from a non-site page (inferred: no, the page is the same code).

### Critical Files for Implementation

- `/home/daug/dev/dolly/src/browser.mjs` — becomes `boot(element, options)`; every rename of section 3 lands here
- `/home/daug/dev/dolly/src/image-artifact.mjs` — image metadata, recipe and pack URLs move from the core's directory to `image.base`
- `/home/daug/dev/dolly/host/http/http.mjs` — the policy consumed from configuration instead of `window`
- `/home/daug/dev/dolly/terminal.html` — the site page as the first consumer of `boot()`, keeping the globals for the tests
- `/home/daug/dev/dolly/scripts/package-pages.sh` — the sealing step the new `scripts/package-npm.mjs` reads from and mirrors (file lists at lines 50-79)