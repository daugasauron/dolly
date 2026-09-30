# Finish Slopyard and Dollyfile v4 integration onto main

- STATUS: CLOSED
- PRIORITY: 270
- TAGS: release,runtime,images

Reconcile the game branch with main: clean Slopyard identifiers and URL, visible
Dollyfile rebuild output, no HTTP/module requests per process start, removal of
the four retired interactive images, and minimal v4 host requirements throughout.
Audio for 0 A.D. is tracked in `20260930-001-v4-audio`.

Completed on 2026-09-30 in `work/gpu-shaders` and merged into local main:

- Main's audio, 0 A.D., GPU and streaming snapshots are integrated with the
  branch's host modules and threads. Main revision is
  `e3ba5fb5704785bae9fa2f6610ac2fa5e1f716f2`. Prepared source is committed at
  `faf8f36`; merge `1f0995d` records both histories with the same verified tree.
  Local main now contains this merge and the verified fixes through `136f1e2`.
- Slopyard source, recipes, tests, retained paths, save tags and URL are renamed.
  No old-name reader or redirect was added. Six recovered save files are
  hash-verified in the private `build/slopyard-migration-20260930/original/`.
  Converted copies include the checkpoint world (157 characters, 110 designs,
  Lua world v6) and working blueprint. Chromium and Firefox import both and
  re-export them in the current formats; the originals remain untouched.
- The gamedev, gamedev-phone, external-source and python-pi images and their
  sole-use demo sources are removed. Bhop now composes the retained game SDK,
  Javascript, Pi and SDL2 artifacts. Both publication selections include Slopyard;
  GitHub's Pi Local and Studio links still target the domain.
- A fixed process-worker bundle is fetched once per supervisor and retained as
  a Blob URL for fresh process/thread Workers. The core and thread browser
  checks abort HTTP with caching disabled during command/thread creation.
- Bootstrap, standalone rebuild and in-app build output share a bounded 1 MiB
  text log. Output is live even without a trailing newline; tail-following pauses
  when scrolled up. The in-app log also receives compiler stdout/stderr while
  streaming it to the calling command. Browser proof exercises warnings and
  compile errors, success, cancellation and opening the completed image.
- All 40 images and their 120 reachable recipes use v4. Snapshot startup selects
  runtime plus declared providers. System shells retain display/HTTP/files/session
  tools; GPU, audio and threads are not enabled globally. Only Slopyard requires
  runtime threads. Pi Local declares GPU explicitly after copying its engine;
  the engine's compiler image needs none. The GPU and audio SDKs enable their
  respective device APIs. Ghostty's build artifact no longer activates display.
- Route generation clears its own output, preventing retired pages from lingering.
  All 384 HOST sources verify (3,304,498,103 bytes); 120 missing inputs were
  recovered from existing local sources/releases after matching recipe hashes.

The resumed source audit found stale staged libcurl, Dollyfile executor and Pi
tools inputs. These are refreshed, along with the LLM engine headers and Studio
archive; pins and routes are regenerated. All 65 mapped loose source inputs now
match their repository files, and the Dollyfile archive matches the current
executor and headers. Pin consistency alone did not establish source freshness.

Evidence:

- Host modules, audio bridge, image graph, image build service, image inputs,
  browser startup helpers and snapshot pack tests pass.
- `node scripts/lint-dollyfiles.mjs`, `node scripts/verify-static-sources.mjs`,
  `node scripts/generate-routes.mjs` pass; 1,403 routes generated. The worker
  bundle has no external imports. Browser, runtime worker, rebuild page and GPU
  worker resolve all imports with esbuild. Changed JS and shell scripts pass
  syntax checks.
- No active source/catalog/route reference uses the old game name. Original
  private backups and immutable past releases are preserved.
- Native parser/retention fixtures pass. The combined runtime builds and passes
  exact browser-import and kernel ABI
  checks. Log: `build/slopyard-integration-20260930/runtime-build.log`.
- All 287 source tests pass (`source-tests.log` in the same directory).
  Chromium verifies split ANSI/CRLF output, literal text, bounded log retention,
  clearing for retries, and standalone compiler rebuild cancellation/retry.
  All 40 images now validate against the combined runtime and current recipes
  (`images-build.log`, `images-replan.log`). The final replan reused every image.
  Studio's full build-output check passes warnings, errors, stdout/stderr before
  completion, cancellation and opening the finished image (`studio-build-browser.log`).
- Chromium and Firefox pass core and compiled-thread checks with HTTP blocked:
  commands and thread creation make zero HTTP requests after boot. C/C++
  compilation, cancellation, recovery and ABI rejection also pass.
- Both browsers pass PCM playback and 0 A.D. combat/economy audio, rendering,
  gameplay input, save/load, process restart and shell recovery. Hardware GPU
  rendering and fluid compute/control checks also pass in both browsers.
- Both browsers boot Slopyard and import the recovered world (157 characters,
  110 designs, with saved programs intact) and 37-block blueprint. The import
  check found and fixed a parser-error fallback that prevented text character
  imports. Current-format world and character exports are preserved alongside
  the original backups. Logs: `slopyard-{chromium,firefox}.log`.
- The rebased Bhop image passes source-built movement, mouse controls, jumps,
  normal exit and cancellation/recovery (`bhop-browser.log`).
- ClassiCube passes textures, walking, capture, block placement/removal checked
  in saved map data, save/reload and exit/cancellation recovery. Its save inspector
  now copies filename bytes before decoding the resizable snapshot buffer
  (`classicube-browser.log`).
- Rebuilt Codex passes TUI editing/paste, real shell-tool execution and exit,
  plus device-login cancellation, credential persistence, restart and refresh
  against its test server (`codex-browser.log`, `codex-login-browser.log`).
- Rebuilt Neovim passes shifted input, writing files, Slop shell commands and
  exit/recovery (`neovim-browser.log`). A dangling call to the previously removed
  menu-test helper was removed from that check.
- Python passes child processes, streaming, cancellation and Bonnie's real
  PEP 517 policy/cleanup (`python-browser.log`). RTS Arena passes replay, setup,
  masked paste, model/effort selection and credential persistence. Its selection
  check now waits for menu rendering (`rts-launcher-browser.log`).
- Packaged inventory checks for GPU images now use the empty build page, so
  they inspect the restored filesystem without starting the interactive app.
  Studio passes this check (`studio-inventory.log`); its hardware runtime and
  compiler-output checks remain separate and passed.

- Both browsers pass bundled local-LLM inference, reuse, cancellation, session
  restore and fresh boot with external requests denied (`local-llm-browser.log`).
- All 27 artifact checks pass (`artifact-tests.log`). The final source run passes
  all 287 tests; all 40 pinned image recipes lint.
- Both distributions pass packaged browser inventories: 40 images for the domain,
  30 bundled on GitHub Pages. The GitHub site contains 867,722,627 file bytes;
  Pi Local, Studio and 0 A.D. retain domain links. Both catalogs contain Slopyard
  and its rebuild route, preserve the game SDK, and exclude the retired images.
  Accepted source is `136f1e2149d157113d5d3d2d580080840b1891db`. Local releases:
  `build/slopyard-integration-20260930/{domain,github}-releases/current`;
  manifests begin `424eb5ba7d57` and `215e2af95733`, respectively.
- Main was fast-forwarded from `e3ba5fb` through `136f1e2` after verification.
  No push or external deployment occurred during this integration.

The ignored `build/slopyard-integration-20260930/main-preparation.json` records
source preparation. Its one-time scripts MUST NOT be rerun over the edited tree.
