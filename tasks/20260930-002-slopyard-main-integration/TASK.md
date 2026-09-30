# Finish Slopyard and Dollyfile v4 integration onto main

- STATUS: OPEN
- PRIORITY: 270
- TAGS: release,runtime,images

Reconcile the game branch with main: clean Slopyard identifiers and URL, visible
Dollyfile rebuild output, no HTTP/module requests per process start, removal of
the four retired interactive images, and minimal v4 host requirements throughout.
Audio for 0 A.D. is tracked in `20260930-001-v4-audio`.

Prepared in source on 2026-09-30 in `work/gpu-shaders`:

- Main's audio, 0 A.D., GPU and streaming snapshots are integrated with the
  branch's host modules and threads. Main revision is
  `e3ba5fb5704785bae9fa2f6610ac2fa5e1f716f2`. Prepared source is committed at
  `faf8f36`; merge `1f0995d` records both histories with the same verified tree.
  Main has not yet advanced to this merge.
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
- Execution permissions were restored. Native parser/retention fixtures pass;
  the combined runtime builds and passes exact browser-import and kernel ABI
  checks. Log: `build/slopyard-integration-20260930/runtime-build.log`.
- All 287 source tests pass (`source-tests.log` in the same directory).
  Chromium verifies split ANSI/CRLF output, literal text, bounded log retention,
  clearing for retries, and standalone compiler rebuild cancellation/retry.
  The full image rebuild is running (`images-build.log`).
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

Remaining gates (do not close until verified):

1. Finish the image rebuild, the Studio compiler rebuild-output check and
   retained-image inventory checks. The running build cached the old Slopyard
   recipe before its import fix; if it rejects that recipe, replan normally.
   The corrected Slopyard image is already built and verified separately.
2. Verify complete distribution packaging, then advance main to the verified
   merge and record final evidence. No push or deployment has occurred.

The previous Podman, process-execution and metadata-write permission failures
are resolved. Images must still be rebuilt against the combined runtime; do not
bypass staleness checks or mark old images current.

The ignored `build/slopyard-integration-20260930/main-preparation.json` records
source preparation. Its one-time scripts MUST NOT be rerun over the edited tree.
