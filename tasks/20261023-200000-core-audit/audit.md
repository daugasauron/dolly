# Core audit after the 0.1.4 work (2026-10-23, read-only)

Read: `AGENTS.md`, `docs/architecture.md`, `docs/browser-boundary.md`, `host/README.md`, `docs/embedding.md`, `docs/sources.md`; on `main` (`a7faf432`) the registry, `boot()`, the modules, `scripts/package-npm.mjs`, `test/npm-browser.mjs`; on the branches `core/touch-module` (`5b0792bf`), `core/seed-compiler` (`d0ed697c`), `core/audit-fixes` (`b647d46f`), `core/amy-environment`, `demo/janis-install`, `demo/opus-in-pi`; the tasks `npm-packages`, `touch-module`, `llvm-in-dolly`, `bridges`, `test-surface`, `opus-in-pi`. Nothing was built, served or run; every claim below is from the text and `git`.

Costs use two facts: the 0.1.4 round rebuilds every image anyway (`core/seed-compiler` changes the seed: "Stale: every image"), so an edit to a pinned document or a seed source made **before** that round is free; made after, a pinned document (`docs/browser-boundary.md`, `docs/http.md`, `docs/input.md`, `docs/architecture.md`, `host/README.md`, the `.wat` files: `Dollyfile-dolly-docs`) rebuilds `dolly-docs`, `pi-agent`, `pi-local`, `dollyfile-studio`, and a seed source rebuilds the catalog. `AGENTS.md`, `README.md`, `docs/embedding.md`, `docs/sources.md` are not pinned.

Findings are ordered by value. "fix now" = clear, small, consistent with a recorded decision; "owner" = a design decision, one line each at the end.

---

## 1. `core/touch-module` was cut before today's `main`: the merge must take main's `terminal.html`, the Paste button's CSS belongs in `host/input/input.mjs`, and two files on main still say `buttons` — fix now

**What.** The branch forks at `e936ac95`, before `d65a97cd` ("boot(element, options)"; "the download, upload and build modules bring their own CSS") and `cdd4e238` (npm). `terminal.html` is the only file both sides changed since. The branch edits the *old* 110-line `terminal.html` and puts the new button's look there (`#paste` rules, branch `terminal.html` ~88-91); its `host/input/input.mjs` appends `<button id="paste">` to `document.body` with no style of its own. On `main`, `terminal.html:23-37` still carries the `#buttons` rules and `--buttons-height` (the one exception `d65a97cd` left because `host/buttons/buttons.mjs:13` says "terminal.html styles it"); `scripts/package-npm.mjs:28` lists `buttons` among `deviceModules`; `docs/embedding.md:10` lists `buttons` among the device packages. Neither file exists on the branch.

**Why.** `d65a97cd`'s decision ("modules bring their own CSS") is what makes `@daugasauron/dolly-host-input` usable in a page that is not the site; a Paste button styled only by `terminal.html` is unstyled in every embedding. The two `buttons` leftovers make `package-npm.mjs` throw (`host/buttons/module.json` gone) the first time the release checklist packs.

**Fix.** At merge: take main's `terminal.html` whole and delete both the `#buttons` block and `--buttons-height` (no `#paste` block either); `input.mjs` appends its `#paste` style element as `host/download/download.mjs:28-33` does and removes it in `dispose()`; `scripts/package-npm.mjs:28` and `docs/embedding.md:10`: `buttons` → `touch`. `Dollyfile-dolly-docs` is already repinned on the branch.

**Cost.** None beyond the branch's own: the branch measured that `touch@0` leaves the seed alone (packaged module, image inputs `a24f5a0f…` unchanged); the docs chain rebuilds in the round regardless.

## 2. Everything that touches the seed must be on `main` before the round's first build — fix now (sequencing)

**What.** Seed sources today, each of which changes the image inputs and so every image: `core/seed-compiler` (the compiler itself), `core/amy-environment` (`src/commands/amy.c`, plus ten recipe pins), and the still-uncommitted Slop fixes of `core/audit-fixes` (`kill %N` in `src/slop.c`, `test -nt/-ot/-ef` in `src/commands/test.c`, `ls /proc` in the kernel). What the branch has so far is `demos/tools` (tar by `posix_spawn`) and the `system`/`session-recover` split (`Dollyfile-system` now `INSTALL`s `core`, `cc`, `make`, `posix`, `ninja` so `amy list` reports what the base holds; `Dollyfile-session-recover` moves `FROM system-tools`), which rebuilds `system` and every demo built on it.

**Why.** AGENTS.md: "Development iteration speed is king." A seed source merged after the catalog round costs a second full catalog (the touch task measured the round at "every image").

**Fix.** Merge order: `core/seed-compiler` → `core/touch-module` (they overlap in `README.md`, `config/upstreams.json`, `scripts/build.sh`, different hunks) → `core/amy-environment` → `core/audit-fixes` once its Slop and `test` changes are committed; only then `npm run build:runtime` and the catalog. Two notes for the fixer: `which`'s wording is sbase's (`demos/tools` already carries one sbase patch; a second one for prose would be the fork AGENTS.md's porting rules refuse: say `command -v` in the guidance instead); and the opus task's three "for the owner" questions (`nena@0` in `pi-agent`, `exec`, `/proc` listing) are design questions, not part of this list.

## 3. `applicationBase` is the image directory, but three page sides use it as the site: saving a session in an npm page rewrites the tab's URL into `node_modules/` — fix now

**What.** `src/browser.mjs:141` `const applicationBase = imageBase;` (since `c8ee1f83`). For `host/http/http.mjs:44,47` that is right: site paths (`/v0.1.3/Dollyfile-…`) name files of the image directory. But `host/snapshot/ui.mjs:161` does `history.replaceState(null, "", sessionLoadUrl(name, applicationBase))`, which is `publicURL("session/?name=NAME", imageBase)` (`src/session-store.mjs:57-61`, `src/static-asset.mjs:39-43`); `ui.mjs:97` links `sessions/` under it; `host/snapshot/snapshot.mjs:47-48` offers the same URL when the image ends; `host/gpu/gpu.mjs:48` links `docs/gpu.md` under it. In the page of `docs/embedding.md`, `images` is `node_modules/@daugasauron/dolly-image-default/`, so Ctrl+Shift+S sets the tab's URL to `…/node_modules/@daugasauron/dolly-image-default/session/?name=NAME` (a reload finds nothing there), and the two links are 404s. `test/npm-browser.mjs` saves no session, so it passes.

**Why.** The embedding is today's contract ("the core modular host interface concept is clear", owner 13:30); one value with two meanings (where the image's files are; where the site's routes are) is the unclear part, and here it is a bug an embedder meets on the first Save.

**Fix.** Separate the meanings. The smallest: `boot()` takes an optional `site` (the root the routes `session/`, `sessions/`, `docs/` live under); `terminal.html` passes `assets.href`; the resource reaches modules beside `applicationBase`; `snapshot` rewrites the URL and shows its two links only when `site` is given, `gpu` likewise. About ten lines plus the resource list in `host/README.md:36-42`. The alternative with no new option is to drop the URL rewrite and the two links from the modules altogether (the site's `/sessions/` page still lists saves): fewer lines, one site feature less; the fixer may prefer it, and the owner's item 2 below is the larger shape this belongs to.

**Cost.** `host/README.md` is pinned: free before the round. No image input.

## 4. `hostModules` and `closed` are a second way to bound the module set, and only three tests use it — fix now

**What.** `src/browser.mjs:50,125,155-156,162`; `host/modules.mjs:56-58,196`; `terminal.html:54-55,64`; `docs/embedding.md:42`; `docs/browser-boundary.md:86-87,110-112`. Since `234331ba` the embedding names the page's modules by URL (`modules`) and a module not named exists neither on the page nor in the Worker; that is the bound `DOLLY_HOST_MODULES` gave (`a182787a`, the bridges task: "An embedding's DOLLY_HOST_MODULES stays a bound"). Who sets it today: `test/host-modules-browser.mjs:8,25,140`, `test/nena-browser.mjs:260`, `test/threads-browser.mjs:11-14` (redundant there: the custom recipe declares `threads@0` itself and the rebuild route adds `buildHost`). No embedding, no script. The npm plan kept it so that `docs/browser-boundary.md`'s two sentences "stay true" without a repin (`plan.md:84`); the round repins anyway.

**Why.** AGENTS.md: "Every line … has to earn its right"; two levers for one thing make the interface less clear, and this one is test-only surface in the embedding API.

**Fix.** Drop the option and `closed`; `terminal.html` keeps the test hook by filtering `hostModuleUrls` to the names `DOLLY_HOST_MODULES` lists (the two restricting tests keep working; `threads-browser` drops its `enable`); `docs/browser-boundary.md:86-87,110-112` say "the modules the embedding names"; the `docs/embedding.md:42` row goes. Verify with `host-modules`, `nena`, `threads` in both browsers.

**Cost.** `docs/browser-boundary.md` is pinned: free before the round.

## 5. `consumeDollyHttpPolicy` consumes a throwaway object; `docs/http.md` still tells embeddings to set a global — fix now

**What.** `host/http/http.mjs:43-44` builds `{ DOLLY_HTTP_POLICY, DOLLY_HTTP_RELAYS }` from `configuration.embedding` and hands it to `consumeDollyHttpPolicy` (`host/http/policy.mjs:256-265`), which deletes the two properties from that object. Since `d65a97cd` the only global reader is `terminal.html:54-55`. `test/http-policy.test.mjs:93-106` tests the deletion. `docs/http.md:61-62` and `:112-113` ("Restricted embeddings set a policy before `browser.mjs` loads; the broker consumes and deletes the global") describe the old mechanism; `boot({ http })` is the embedding's (`docs/embedding.md:43`).

**Fix.** `http.mjs` constructs `new DollyHttpPolicy(policy, bootstrapSources, applicationBase, relays)`; `consumeDollyHttpPolicy` and its test go (about 15 lines); `docs/http.md` names `boot()`'s `http` option, and the globals as the site page's. `host/http/module.json`'s `fixed` text stays true.

**Cost.** `docs/http.md` is pinned: free before the round.

## 6. `AGENTS.md` says the compiler seed is built outside; after `core/seed-compiler` it is not — fix now (on the branch)

**What.** `AGENTS.md:150-151`: "An external toolchain builds the kernel and compiler seed." After `d027a1cb` the seed's compiler is the one `llvm-cc` linked inside Dolly from the previous seed; `docs/sources.md` on the branch says so, `AGENTS.md` is not in the branch's diff. (`README.md:114`'s `./scripts/build-toolchain.sh` line is fixed on the branch.)

**Fix.** One sentence: "An external toolchain builds the kernel and the seed's libc; the seed's compiler is the one the previous seed built inside Dolly (`docs/sources.md`)." Not pinned; no image.

## 7. The runtime package ships 24 contract `.wasm` files and reads four; its device list is a third copy — fix now

**What.** `scripts/package-npm.mjs:66-68` adds every `dist/dolly-*-0.wasm` to `@daugasauron/dolly`. The runtime fetches `dolly-process-gate-0`, `dolly-process-0`, `dolly-threads-0` (`src/process-supervisor.mjs:152`) and `dolly-dso-0` (`host/dso/dso.mjs:11`); the other twenty are device contracts whose modules ship as their own packages, review-only contracts (`browser`, `host`, `image`, `supervisor`, `kernel-plugin`) and, until `dist` is rebuilt, `dolly-buttons-0.wasm`. `:27-28` spell the runtime/device split that `docs/embedding.md:9-10` and `host/README.md:50-51` also spell; `deviceModules` is `host/manifests.mjs` minus `runtimeModules` minus `build`.

**Fix.** Name the four files; derive `deviceModules` from `hostModuleNames` so a module's arrival is one edit (`manifests.mjs`). Bytes are small; the point is a package that says what it is.

## 8. `docs/embedding.md` promises `amy`; in a package `amy install` has nothing to find — fix now

**What.** `src/commands/amy.c:25` fetches `/v0.1.3/amy-index.txt`, a site path the broker resolves against the image directory (`http.mjs:47`): no such file in `dolly-image-default`, so 404. `packages@0` serves only the packages in `DOLLY_IMAGES` (`host/packages/service.mjs:32`): in the package that is `default`'s closure, all installed already. `docs/embedding.md:11` lists `amy` among what the image offers.

**Fix.** One sentence at `docs/embedding.md:11`: the package holds the default image alone, `amy` lists what is installed and installs nothing. Not pinned.

## 9. The provider context: five of seventeen members have one reader — fix now, low

**What.** `host/README.md:36-42` documents the context as "the page's shared resources". `bootstrapSources` and `inherited` are read by `http` alone (`http.mjs:10,44-45`); `abi` and `service` by the runtime's Worker side alone (`runtime.mjs:79,123`); `modules` by `nena` alone, by design (`switches`). `check()` is clear: a reason that makes a module unavailable without failing the boot, which `nena` reports; `gpu.check()`'s indicator side effect is explained in its own comment, and `runtime.check()`'s isolation test is the one message an embedding without COOP/COEP sees (`test/npm-browser.mjs:71`). No change there.

**Fix.** `bootstrapSources` and `inherited` travel in `configuration.http` beside `embedding` (`browser.mjs:161` already builds that object); two members fewer, `host/README.md` shorter. `abi`, `service`, `modules` stay (the registry's own).

## 10. Registry members nobody reads — fix now, trivial

`hostRegistry` returns `contracts` and `runtimes` (`host/modules.mjs:33`), `createHost` returns `get` (`:249`): none is read outside the file (grep over `src`, `host`, `scripts`, `test`; `test/host-compute-browser.mjs:49` reads `urls` only). Drop the three names. Every manifest field has a reader (`gives`: nena and the npm description; the rest: registry, build, lint); `build`'s and `packages`'s five empty arrays exist for `scripts/host-modules.mjs:10`'s `.flat()`; leave them, they are grepable.

## 11. `touch@0` against `input@0`: the contract is the owner's and clean; one new duplicate, one measurement left

The branch did what the task's decided contract says: a mailbox and no import (`abi/dolly-browser-0.wat` unchanged), one lease under input's foreground rule, the page as the one producer, `buttons@0` gone with the kernel's typed queue (`host/input/kernel.c` −62, `src/dolly.c` −15, `src/process-kernel.h` −8). Who owns a finger is decided in page code from the lease word (`touch.mjs` `finger()`), as `docs/input.md` (branch) says. Two notes:

- The Worker-side wake loop (`Atomics.waitAsync` on a mailbox word → `get("runtime").serviceDeferred()`) is now the same six lines in `display.mjs`, `input.mjs` and `touch.mjs`. `runtime` could offer it as it offers `leaseBridge` (`host/README.md:43-46`); fix now, low, no image input.
- The branch's own "Left": no phone was connected, so whether Gboard's paste into the page's keyboard reaches the terminal was not measured; if it does, the Paste button in `input@0` (about 20 lines, plus the `docs/browser-boundary.md` and `docs/input.md` sentences) can go. Measure before the catalog round, since `docs/input.md` is pinned.

## 12. Smaller notes

- `src/images.mjs:6-10` exports mutable bindings set by `loadImages()`; `boot()` tolerates a second call for its `<style>` (`browser.mjs:51`) but a second `boot()` with another `images` replaces the first's catalog. One line in `docs/embedding.md` ("one image directory per page") is enough for 0.1.4.
- `src/terminal-text.mjs:1-3` still calls its functions "what tests and recordings read a terminal page with"; `docs/embedding.md:32-34` presents them as the embedding's handle, which is the owner's 2026-10-14 decision (document `__dolly`, change no code). One comment line.
- `dataset.*` flags written for one test each: `downloadName` (`download.mjs:100`), `clipboard` (`display.mjs:262-270`), `terminal` (`:310`), `fullscreen` (`page-chords.mjs:15,39`), `terminalCols`/`Rows` (`display.mjs:245-246`). Seven lines; covered in spirit by the same decision. Leave.
- Generated errno tables in fourteen `abi.mjs` files beside `src/process-constants.mjs`: decided in `e936ac95` ("a module's C includes `<dolly/process.h>`"). Leave.
- `core/janis-install` and `demo/opus-in-pi` touch no core file (`test/amy-browser.mjs` aside). Fine.

---

## For the owner (three lines)

1. **`llvm` package.** With the seed's compiler now the one `llvm-cc` links, `demos/llvm/Dollyfile-llvm` is `cc` plus two wrapper scripts over a second 96 MB copy of the same bytes (its `check.slop` in `Dollyfile-llvm-cc` proves them equal); your "llvm should always be useful?" — drop it (a leaf package: nothing else rebuilds, `amy-index.txt` regenerates), or say what it should be useful for. The seed task also lists this.
2. **The seed compiler's recipes in `demos/llvm/`.** The chain `llvm-tablegen` → `llvm-build` → `llvm-cc` needs `cmake-build` and `python` (`Dollyfile-llvm-tablegen:11,13`), so it cannot move to the top level without them; the core reads only the pin (`config/source-pins.sh`, `scripts/build.sh`). Accept it as the bootstrap exception `docs/sources.md` now records (then `AGENTS.md:131-133` gains "…but for the compiler's bootstrap, recorded in `docs/sources.md`"), or move the chain up with CMake and Python (large). I recommend the first.
3. **Site code in the runtime package.** `@daugasauron/dolly` carries about 800 lines that cannot run in a package: `src/image-build.mjs`, `image-builder.mjs`, `custom-image.mjs`, `dollyfile-view.mjs`, `dollyfile-graph.mjs`, `image-inputs.mjs`, `host/manifests.mjs` (imported at `image-builder.mjs:19`; it throws there, since only the runtime modules' manifests ship), and the rebuild branches of `browser.mjs:164-181` and `runtime-worker.mjs:152-235`; `boot()`'s `mode` and `loadSession` are the site's and absent from `docs/embedding.md`. The 13:30 decision kept building with the site "for now" and the 14:45 note declined lazy-loading it. Keep for 0.1.4 as decided, or after the release split `boot(element, { images, image, modules, http })` from a site wrapper (`mode`, `loadSession`, `site`, the test hook), which findings 3 and 4 already lean toward. No image input either way.

## Checked, no change

Device modules import only their own files (`package-npm.mjs:77-78` enforces it at pack time; the task measured the packs booting in both browsers). `build@0` is in `host/manifests.mjs` and not published: right. The `nena` model, `fixed`, `switches`, `provides` are the owner's (bridges task). The registry's `attach`/`detach`/switch protocol is one path for boot and for `nena`, as decided. `boot()` validates its options once and the Worker validates the list it is sent again: both sides are trusted, both checks are cheap; leave.

### Critical Files for Implementation

- `/home/daug/dev/dolly/src/browser.mjs` (findings 3, 4; `applicationBase`, `hostModules`, `closed`)
- `/home/daug/dev/dolly/host/modules.mjs` (findings 4, 10)
- `/home/daug/dev/dolly/host/snapshot/ui.mjs` (finding 3, with `host/gpu/gpu.mjs:48`)
- `/home/daug/dev/dolly/scripts/package-npm.mjs` (findings 1, 7)
- `/home/daug/dev/dolly/host/http/http.mjs` (finding 5, with `host/http/policy.mjs:256-265`)