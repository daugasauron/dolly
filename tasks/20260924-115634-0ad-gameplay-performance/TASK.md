# Audit 0 A.D. gameplay and performance across browser hardware

- STATUS: OPEN
- PRIORITY: 250
- TAGS: performance,wasm64,gpu,0ad

Continue on the Blockwalker-based `codex/0ad-baseline-20260923` branch through
2026-09-25 07:00 JST (2026-09-24 22:00 UTC). Starting release: `bc908afa`,
implementation `ad9af62`. LAN hosting was cancelled before any service changes.

Requirements:

- Reproduce and fix terminal text showing through graphics.
- Profile and reduce selection/drag-box stutters, including tail latency.
- Start the image at the upstream main menu; single-player setup must create
  playable matches with complete assets and without missing-texture errors.
- Audit performance and add supported gameplay features with maintainable
  interfaces and upstream source/configuration preferred over special cases.
- Verify multiple browsers and resource/performance conditions, including lower
  specifications; do not infer portability from this PC's high-end GPU alone.
- Preserve input, audio, saves, simulation correctness, shell recovery and the
  browser security boundary. Publish and verify a fresh local release.

Run one physical GPU workload at a time, with bounded browser memory. Record
measurements and evidence here before closing; average FPS alone is insufficient.

Initial Firefox 155 reproduction finds GPU release fences dominate drag stutters:
211 ms worst frame during the first drag, 208 ms during repeated dragging, and a
644 ms frame when the selection panel first populates. Deferred resource cleanup
invalidates handles immediately while retaining byte/object charges until queue
completion. With the original engine unchanged, first-drag maximum is 20.9 ms;
repeated-drag p99/max are 26.9/36.9 ms, versus 37.1/208.0 before. The complete
27-second sample's p99 improves 42.1 to 31.6 ms; maximum remains 206 ms during
first-use UI loading. Stage boundaries omit their first interval; the complete
sample includes those transitions. Evidence: `.cache/0ad/selection-{baseline,
retirement-final}-firefox.log` and matching frame JSON. An experimental native
buffer-growth change showed little additional benefit and was removed.

Real-browser GPU checks hold completion notifications to prove nonblocking
release, stale-handle rejection, retained allocation/object charges, reclamation,
and close/restart without duplicate credits. Existing texture/depth/indexed,
1,024-command, hostile-packet and forced-termination checks also pass in
Chrome/SwiftShader and Firefox hardware. Evidence:
`.cache/0ad/retirement-gpu{,-firefox}-proof.log`.

The user confirms text shows through during normal play. Browser screenshots
hide the problem, but X11 captures of installed Firefox 155.0.1 show the striped
test background blending through terrain. The final presentation shader now
writes alpha 1. The checked actual-window region changes from 25,828 magenta
pixels to zero. A real-GPU readback before browser compositing detects 421,479
non-opaque pixels in the old engine and zero in the fixed engine. Evidence:
`.cache/0ad/browser/native-firefox{,-opaque}-window.png`,
`.cache/0ad/opacity-baseline.log`, `.cache/0ad/opaque-gameplay-firefox.log`.
The complete Firefox gameplay test passes: combat mean/p99/max 12.5/31.4/41.5 ms,
economy 10.1/34.9/178.5 ms; input, AI, training, construction, audio, save/load,
fresh processes and shell recovery pass. Cold UI loading still needs work.
The content package contains only two map closures and Athens, while the menu
exposes broader choices. All upstream assets recompress losslessly to about
1.79 GB, above the current 1 GiB snapshot limit; measure packaging/memory options
before choosing a complete-content approach. `.cache/0ad/content-sizes.log`.

Complete graphical content now totals 1,892,581,392 bytes in 28 bounded ZIP
archives plus config/licenses. A CRC/size audit checks all 40,594 packaged files
against upstream: the only changed original files are the eight declared
gameplay patches; additions are translated WGSL. Evidence:
`.cache/0ad/full-content-{package,verify}.log`. The wrapper and image recipe now
start the upstream main menu; full menu-to-match verification is still pending.

Packaged restoration now streams into a 1 MiB Wasm staging range and verifies
parts, exact manifest membership, ordering and the final canonical image hash
before launching userspace. Image bound is 2 GiB; static multipart inputs remain
1 GiB. Chrome/Firefox core checks, in-Wasm restore checks (all split boundaries,
reverse/interleaved packs, truncation, duplicate paths and bad hashes), and real
browser compressed-pack success/rejection checks pass. Evidence:
`.cache/0ad/streaming-{core,retention,packs}-browser.log`.
Normal packaged boots use the immutable HTTP pack cache; rebuild/custom image
artifacts retain their identity-checked IndexedDB cache.

The old 580,774,695-byte image reached the Firefox menu in 8.67 s, with
1,276,313,600 kernel memory bytes and 3,318,194,176 peak cgroup bytes:
`.cache/0ad/menu-baseline.log`. Full-image export's first attempt reached its
12 GiB cgroup bound and crashed the Chrome renderer (confirmed through CDP),
without an OS OOM kill. Artifact caching now uses Blob payloads rather than
structured-cloning multi-gigabyte ArrayBuffers; the host export streams to its
output file. The browser harness now rejects a crashed renderer promptly.
The full 2,068,906,450-byte image now builds/exports under a 10 GiB scope.
The builder releases its Worker before hashing/caching, IndexedDB stores Blob
payloads, and export uploads a Blob to a streamed host output file. Chrome and
Firefox custom-session build/save/restore/export checks still pass. Evidence:
`.cache/0ad/full-menu-image-blob-export.log`,
`.cache/0ad/streaming-custom-session-browser.log`.

A raw 2 GB Firefox download hit the 5 GiB scope limit and was OOM-killed before
boot. The same image delivered in 59 packs reached its menu in 25.9 s, with
2,231,631,872 kernel bytes and 3,890,806,784 peak cgroup bytes. Development
builds now emit/reuse packs too, repairing missing delivery files from verified
snapshots. Source checks pass 278/278; real-browser reversed/interleaved packs
and bad-hash/truncation rejection pass with the packed source build.
Evidence: `.cache/0ad/source-{packs-build,stream-packs-browser}.log`.

The menu created Acropolis Bay with a random civilization, then generated
Alpine Lakes with Han. Both rendered successfully; the complete process exited
with 0 errors and 0 warnings. Random-map generation took 11.38 s. The two-match
session peaked at 4,484,526,080 bytes without touching the 5 GiB cap. Evidence:
`.cache/0ad/full-packed-menu.log`, `.cache/0ad/browser/full-{acropolis-match,
alpine-match-later}.png`.

`test/0ad-menu-browser.mjs` now creates Acropolis Bay with Britons and generates
Alpine Lakes with Han through normal menus, verifies both replay identities and
clean engine logs, then returns to the shell. It passes in Firefox 155 and
Chrome 151: menu boot 25.9/23.7 s, map load 10.4/10.4 s, random-map load
18.9/19.2 s, peak cgroup bytes 4,140,834,816/3,778,322,432. Evidence:
`.cache/0ad/full-menu-{firefox,chromium}.log` and matching `menu-*` captures.
Both browsers also build, cache, reopen and run the same C-compiled custom image
through the disposable builder: `.cache/0ad/disposable-builder-proof.log`.

Full-content Firefox gameplay checks pass under 5 GiB: combat mean/p99/max
11.72/23.58/35.04 ms, economy 9.80/33.28/147.84 ms; peak 4,041,228,288 bytes.
Both processes have clean engine logs and pass selection/movement, economy,
Petra, quick-save/load, sound, opaque presentation and shell recovery. Evidence:
`.cache/0ad/full-content-gameplay-firefox.log`. Cold selection UI still needs
profiling; none of these changes has been published to the user preview yet.

Release acceptance initially failed because the inventory harness exited the
interactive shell that the new game launcher already supplies. The harness now
handles the game's exit shortcut and existing launcher shell; the real in-Wasm
inventory check passes: `.cache/0ad/zero-ad-inventory-recovery.log`.

Native profiler captures found a cold selection frame at 118.9 ms: GUI update
57.5 ms and GUI rendering 47.7 ms. A separate 105 ms pause in audio status was
caused by transferring accumulated browser telemetry between measured stages;
deferring those transfers removed that pause. Native audio mixing/refill did
not account for it. Selection measurement now includes time after mouse release;
profiling continues before changing engine behavior. Evidence:
`.cache/0ad/selection-deep-{audio,quiet}-firefox-profile2.jsonp`.

Published `8503567699b375dc092c844db0b0dded45baa02f8e98584cae9b72312475326e`
to the existing loopback preview. Its Firefox menu test creates both maps with
clean engine logs, peak 4,231,766,016 bytes: `.cache/0ad/published-menu-firefox.log`.

Texture uploads now pause the render pass and submit only if pending draws or
attachments already use that texture. New selection icons batch into 12 packets
instead of 59. A paired Firefox run measured cold selection at 132.9→109.3 ms;
UI preparation remains a separate cost. Evidence: `.cache/0ad/selection-{batch-before,
texture-batch-after}-firefox-*`. The final engine passes combat/economy, movement,
training/construction, save/load, sound, opaque pixels and shell recovery in
Firefox and Chrome: `.cache/0ad/texture-batch-gameplay-{firefox,chromium}.log`.
Source checks pass 278/278; the 41-file patch reconstructs pristine upstream.

Optional BC1/BC2/BC3 texture formats now cross the existing GPU packet interface.
The provider admits the device feature explicitly, validates physical block
bounds and charges all padded mip/layer blocks. The engine retains decompression
when compression is unavailable or an upstream texture's base size is unaligned.
Sampler translation preserves RGB-only BC1 alpha, including cube maps and border
filtering. The 314 translated shaders and 324 linked programs pass software
WebGPU checks. Hardware Firefox and software Chrome verify compressed pixels,
all cube faces, non-power-of-two mip dimensions, bounds and exact byte charges;
the denied-feature run verifies the fallback. Evidence: `.cache/0ad/bc-shaders-browser.log`,
`bc-render-{nonpower-firefox,nonpower-chromium,uncompressed}.log`.

Full gameplay passes in Firefox (compressed and forced-uncompressed) and Chrome:
`.cache/0ad/bc-gameplay-{firefox,firefox-uncompressed,chromium}.log`. Firefox economy
graphics allocations fall from 142,989,672 to 107,959,104 bytes. A paired cold
selection audit measures 107.3→94.7 ms, with similar ordinary frame times:
`.cache/0ad/bc-selection-{uncompressed-firefox,firefox}-*.json`. Two initial
compressed runs contained a 260–270 ms economy outlier. It did not reproduce in
two native-profiled runs or a production repeat (worst 73.8 ms); native profiles
attribute the ordinary 65–68 ms maximum mainly to Petra AI. Pipeline creation
peaked at 3.2 ms in the second instrumented run. Keep the earlier outlier open
for longer-run auditing; these repeats do not establish its cause. Evidence:
`.cache/0ad/bc-stall-audit{-80,}.log`, `bc-production-audit.log`, and
`browser/bc-stall-profile2.jsonp`. All 278 source checks and pristine reconstruction
of the 42-file engine patch pass. Profiling edits are absent from the engine.
