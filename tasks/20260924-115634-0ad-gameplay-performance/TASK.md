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

Verified SOURCE publication now sizes the destination before chunked copying.
Four files of 64 MiB + 1 KiB grew kernel memory by 609,746,944 bytes without
preallocation and 254,803,968 with it; the browser-compiled probe rereads every
byte and checks exact lengths: `.cache/0ad/preallocate-{before,after}.log`.
Native and browser Dollyfile checks pass, including ordered SOURCE replacement.
All twelve images rebuild; the 2,068,928,154-byte game image exports in 50.5 s
under the existing 10 GiB scope. An 8 GiB attempt failed with a confirmed cgroup
OOM kill during game-image building; preallocation alone does not establish an
8 GiB build requirement. Evidence: `.cache/0ad/source-preallocate-{parser,
parser-browser,image,image-10g}.log`, `source-preallocate-10g-memory.json`.

The recipe executor now indexes artifacts through an open in-Wasm file instead
of materializing every payload in its private memory. It accepts snapshots up
to 2 GiB, validates all selected path/type changes before restoring files, and
shares bounded copying with SOURCE publication. Native checks read a sparse
1.5 GiB artifact under a 64 MiB address-space limit and reject malformed sizes,
paths, links, ordering, truncation and pins. Source checks pass 279/279.

Browser-compiled execution successfully inherits the real 2,068,928,154-byte
0 A.D. image, checks all 69 source hashes and runs the restored engine's version
command. Chrome/Firefox FROM takes 1.86/2.74 s, with peak cgroup bytes
5,013,012,480/6,315,053,056. Firefox requires bounded delivery pieces in this
harness: its single raw 2 GB transfer was killed at the 8 GiB cap before FROM.
Chrome additionally verifies repeated COPY reuse, directory merging and both
file/directory type changes. SOURCE/parser browser checks still pass. Evidence:
`.cache/0ad/artifact-stream-{all-source,parser-browser,browser-direct,
browser-firefox-parts,browser-copy}.log`.

The artifact audit also exposed fixed per-record waiting in the libcurl adapter:
curl's raw transfer timed out after four minutes, while the existing direct
Dolly HTTP API transferred the same bytes in 13.5 s (Chrome). Audit ready-data
waiting before treating it as a general network or artifact-reader cost.

The new artifact reader is now in the rebuilt seed and all twelve images.
The 2,068,933,591-byte game image exports in 60.4 s. Chrome and Firefox both
pass custom image construction, cache reuse, saved-session restoration,
export/import and policy intersection with the rebuilt executor:
`.cache/0ad/stream-curl-image.log`, `artifact-stream-custom-session.log`.

Libcurl now waits only when polling produces no record; multi callers receive
an immediate timeout while transfers progress. A 16 MiB, SHA-verified download
measures easy/multi 2871/2871→162/184 ms in Chrome and 2986/2903→101/119 ms in
Firefox. Each multi iteration still gives every transfer one poll. The rebuilt
library passes authentication, protocol/policy rejection, concurrent transfers
and callback cancellation, and both browsers pass core process/HTTP interruption
checks. Evidence: `.cache/0ad/curl-bulk-{chromium,firefox}.log`,
`curl-ready-{contract,core,source}.log` (279 source checks).

Sampler parameters now reuse a uniform slice for each distinct value within the
frame, then discard that index at presentation. Paired Firefox selection runs
reduce uniform uploads 93,323→66,751 bytes/frame and resource groups 12.49→9.87
per frame. Mean frame time is 9.47→9.07 ms and cold selection 95.0→86.5 ms;
these timings are one pair, not a cross-machine performance guarantee. Evidence:
`.cache/0ad/sampler-{before-firefox-complete,after-firefox}.log` and
`bc-sampler-{before,after}-firefox-frames.json`.

The rebuilt engine passes full hardware Firefox gameplay (peak 3,940,442,112
bytes), including opaque pixels, inputs, construction/training, save/load,
audio and shell recovery. The same checks pass on Chrome SwiftShader (peak
3,502,047,232 bytes), but software combat/economy means are 73.3/178.4 ms;
software correctness does not imply playable performance. Source checks pass
279/279 and the 42-file engine patch reconstructs pristine upstream. Evidence:
`.cache/0ad/sampler-cache-{gameplay-firefox,gameplay-software,source,image}.log`.
An initial selection probe was launched before image packing finished and
hit its 5 GiB cap while Firefox received the raw 2 GB image. The completed
packed image passes; that interrupted probe is excluded from the comparison.

Upstream GPU skinning now uses the existing compute/buffer packet operations.
The additive half-float vertex capability converts packed attributes to f32;
separate position/attribute pools satisfy WebGPU's writable-binding alias rules.
CPU skinning remains available, and the upstream config hook now disables as
well as enables GPU skinning during a match. The 316 shaders, 324 graphics
programs and both compute variants pass software compilation and pixel/data
checks. The installed GPU SDK passes hardware Firefox and software Chrome,
including half-float vertices, bounds, quotas and process recovery. Evidence:
`.cache/0ad/gpu-skinning-{shaders-final,sdk-firefox,sdk-chromium}.log`.

A paired Firefox run reduces combat traffic 2,568,181→1,069,494 bytes/frame and
mean frame time 13.59→11.79 ms. Economy means remain about 9.4 ms. These are
single-machine paired measurements: `.cache/0ad/gpu-skinning-pair-{cpu,gpu}.log`.
The CPU run reproduces a 226 ms outlier; a later Chrome run reaches 262 ms.
The intermittent stall remains open.

Software live switching exposed exhaustion of all 4,096 GPU object slots,
including 2,632 cached graphics bindings, with no pending host retirements.
The guest now tracks the admitted object budget, prunes bindings between draws,
and waits only when retired buffers/textures still hold allocation credits.
The provider's quota is unchanged. Full Firefox gameplay also passes with the
provider restricted to 2,048 objects: `.cache/0ad/gpu-object-pressure-final-firefox.log`.
An initial stress run waited unnecessarily for zero-byte bindings and reached
the scenario's defeat screen before the final toggle; that wait was removed.

The final 2,068,965,638-byte image passes software Chrome gameplay and hardware
Chrome restricted to two physical CPU cores and a 4 GiB process-tree cap.
The latter peaks at 3,466,854,400 bytes, with combat/economy means 10.95/9.99 ms.
This constrains resources on the same fast hardware, not CPU/GPU clock speed.
Software means remain 77.88/172.44 ms; software rendering is still slow.
CPU animation with BC compression denied also passes Firefox. Evidence:
`.cache/0ad/gpu-skinning-{final-image,final-software,two-core-chromium}.log`,
`gpu-object-cache-cpu-firefox.log`. Source checks pass 279/279, and the 46-file
engine patch reconstructs pristine upstream.

Opacity capture now requests frames after each scene's measured gameplay;
the previous fixed frame counter could sample loading after menu startup.
Firefox's combat and economy captures both contain zero non-opaque pixels.
Both browsers launch Britons/Acropolis and Han/Alpine Lakes through the actual
menu with clean engine logs. Evidence: `.cache/0ad/gpu-skinning-final-opacity-firefox.log`
and `gpu-skinning-final-menu-{firefox,chromium}.log`.

Chrome at device scale 2 also passes gameplay, explicit combat/economy alpha
captures, browser viewport changes, and a second replayed movement command
issued through the resized canvas: `.cache/0ad/gpu-skinning-hidpi-chromium.log`.
The game retains its 1024×768 render surface while the browser scales it.

Local release `8a01dd68c765917be9f43aee5326ac690d51c4a6388e07da06136934c215adb8`
is built from `9a33c0c`. All twelve image inventories pass acceptance, and
Firefox opens both menu-created matches from the published preview with clean
engine logs (peak 3,806,277,632 bytes). Evidence:
`.cache/0ad/gpu-skinning-{release,published-menu-firefox}.log`.
Archive: `build/0ad/dolly-zero-ad-pages.tar.gz`, SHA-256
`1618c90993f28aed27533215c35f06748a115e9ac45e6d12827f91ca7e9b19f5`.

Selection and Command panels were initialized directly and again through the
ordered panel loop. Removing them from that loop halves their setup calls.
The paired cold-selection totals vary too much to claim a frame-time gain.
Firefox passes the actual gameplay path with the override, including training,
construction, save/load and opaque combat/economy pixels; means are 10.25/9.64 ms
and peak process-tree memory 4,175,126,528 bytes. Evidence:
`.cache/0ad/selection-current-{gui,panels}-firefox.log`,
`panels-gameplay-firefox.log`.

Explicit frame-boundary profiling attributes the apparent post-render gap to
GPU submission, not the profiler (0.013 ms/frame). The Dolly context now retains
the final queued commands for Present, avoiding a separate packet. An A/B/B/A
paused-scene comparison under two CPU cores gives mean 5.08/4.92 ms before and
4.63/4.51 ms after in Chrome, with packets/frame 2.02→1.02. This is a controlled
scene measurement, not a guarantee for active gameplay. Evidence:
`.cache/0ad/frame-{boundary,tail}-firefox.log`, `frame-tail-pair-chromium.log`.

The GPU provider now waits for its oldest outstanding submission at the same
three-submission limit. A real-GPU test holds completions independently: the old
provider remains blocked after the first completion, whereas the new provider
submits the fourth item with the other completions still held. Both browsers
pass quotas, retirement accounting and interruption recovery; source checks pass
279/279. Evidence: `.cache/0ad/submission-{negative,gpu-software,gpu-firefox,source}.log`.
The Firefox provider A/B/B/A comparison overlaps (old 7.44/7.94 ms, new 7.54/7.21 ms).
Software rendering remains slow and uneven; its paired runs do not establish
smooth presentation. `.cache/0ad/{submission-pair-firefox,frame-tail-oldest-pair-software}.log`.

The production engine passes Firefox gameplay and native F2 screenshot readback,
with opaque combat/economy frames, training, construction, save/load and clean
logs. Means are 13.75/11.40 ms, peak 4,036,902,912 bytes. Software Chrome also
passes the native screenshot and gameplay checks (87.82/191.31 ms, peak
3,626,532,864 bytes). Evidence: `.cache/0ad/frame-tail-production-{firefox,software}.log`.
The 46-file native patch reconstructs pristine upstream.
