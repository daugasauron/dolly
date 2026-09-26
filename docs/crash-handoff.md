# Blockwalker local checkpoint

Worktree `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. Overnight deadline: September 27,
08:00 JST. The user requested the checkpoint early at 07:43 JST.
The source checkpoint includes the verified Lua, host-module, thread and
living-world changes. No production push or deployment was requested.

## Preview and rollback

Latest: `http://127.0.0.1:9097/blockwalker/`, service
`dolly-threads-preview.service`. New image built, served and verified through
the actual local URL. Refresh and start a fresh world for the new
catalog and terrain. Restoring a save retains its embedded programs and map.

Frozen threaded rollback: 9096 (`dolly-threaded-baseline-20260926.service`), under
`build/living-world-20260926/checkpoint`. Host-module/Lua checkpoint without
threads: 9098; older image 44: 9099. Preserve these services and relay 9010.
Terrain 5 saves need the new image; keep matching saves with frozen previews.

## Included

82 default objects and 42 referenced Lua programs: all 81 starting objects plus
Shishi's tether interceptor. Controllers remain 20 Hz; physics 60 Hz/eight
substeps, four Box3D world workers. The unreliable ridge crawler is withheld.

- Shape-aware navigation and landing clearance around machinery. `s.bounds(id)`
  returns real nearby Box3D shape AABBs. No new browser capability.
- Repeated physical tender→shuttle→gun reload/fire chains, including outside
  cargo and recovered fired rounds.
- Guards roam, escort carriers, capture opponents and answer reachable team help.
  Magnetic ownership counts all holders and survives save/reload.
- An ordinary thruster/magnet/winch interceptor catches and pulls down opposing
  couriers; their controls and forces remain unchanged.
- Couriers search after stale reports and leave covered passages before climbing.
  Crane/porter handoffs, warehouse restacking and stuck transporters are repaired.
- Quarry: 48 climbable steps and an 8 m landing. East quay: working apron.
  Quarry/Channel camera shortcuts expose the action. Shift+Tab hides panels while
  keeping the FPS badge visible.

Unused JSON catalogs and the JavaScript driver are removed. Legacy Lua program
translations and preserved user saves remain; Pi SDK/protocol glue stays JavaScript.

## Evidence and artifacts

Task `tasks/20260926-231500-codex-living-world/TASK.md`; evidence/runners under
`build/living-world-20260926/`. All C/C++ compilation runs inside Dolly wasm64.

`long-fresh`: 7,200 simulation seconds, 67 deliveries, 11 channel shots, all 83
candidate originals retained, no controller errors/deaths. This run includes the
subsequently withheld crawler and predates the ceiling fix. The actual saved
ceiling incident subsequently replays with an escape and further interceptions.
Ground recovery and balance remain incomplete.

`courier-ground-contact`: 25 nearby/74 distant shape queries, six invalid IDs and
independent copies checked against Box3D. `radio-check`: team/visibility, rate,
coalescing, save and invalid-input behavior. `multi-magnet-winch-v2` and
`capture-reload-final`: real ownership, reeling and repeated attachment restore.
`landing-final`: new collision and older terrain versions.

Packaged Chrome/Firefox checks pass fresh and 151-object restored worlds for
60 real seconds each at 1280×720, split between panels and Focus. Mean submitted
FPS: Chrome 90.32/70.93, Firefox 287.14/195.94. Each view averages above 60;
simulation keeps real time, programs remain 20 Hz, no new faults/deaths, zero GPU
readback bytes and clean shell exit. Screenshots inspected. Frame submissions
are not monitor presentations. The longer fresh pass completes 750 real seconds:
103.675 submitted FPS, 751 simulation seconds, 11 deliveries, no faults/losses.
The subsequent crowded-world pass starts at 34–55 FPS. It was stopped for the
user's checkpoint request; the full endurance test did not pass. Reproduction:
`20260927-074500-codex-mature-frame-rate`. The trailing browser-closed error is the
intentional test interruption. Actual 9097 smoke passes: 82 objects, terrain 5,
all embedded programs match canonical source, zero readbacks, clean shell exit.

The mature input preserves the two-hour run's poses/memory and updates only the
two courier programs; its saved crawler remains valid custom content. Historical
combined Lua harness reconciliation is still open; do not claim all tests pass.

Selected image build: 45.3 s with cached dependencies. `package-proof.json`
verifies all 66 canonical source files, served 9097 hashes, six preserved user
files and the other catalog entries. `preserve-assets.mjs check` verifies 56
other runtime/image assets unchanged. Snapshot 252,579,916 bytes, SHA256
`d13d57dc03151a5a4fb86321a7c547a18d02d01e6cd99a8a816478c2a409c4f5`.
Source tar 4,179,968 bytes, SHA256
`89dfa57411039c42d129783ba94fc13b9770b971d20931f81b0403ba33b5f0bb`.
Runtime identity unchanged:
`d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`.

Completed host-module/thread tasks: `20260926-092542-codex-host-modules` and
`20260926-181716-codex-threads`. Real pthread/std::thread lifecycle/TLS/HTTP checks
pass Chrome/Firefox; complete world saves match across 1/2/4 workers. Four workers
reduce measured physics time 38%/33% and total simulation time 8%/9%.

## Remaining work

Sustained crowded-world FPS: `20260927-074500-codex-mature-frame-rate`.

Grounded-aircraft recovery: `20260927-063100-codex-aircraft-recovery`.
Ridge-rescuer prototype: `20260927-071800-codex-ridge-rescuer`.
Loaded handoff bays: `20260927-074100-codex-loaded-bays`.
Biped recovery into sustained gait: `20260915-110000-codex-01`.
Heavy-vehicle rescue and broader balance: `20260925-205300-codex-01`,
`20260925-221800-codex-01`. Some guards end overturned in long runs.

## Iteration

One disposable browser at a time in a 4 GiB systemd user scope. Chrome uses Xvfb;
Firefox DISPLAY=:1. Node 22 requires `--preserve-symlinks --preserve-symlinks-main`
for runners under the symlinked build folder. Never read visibleTerminalText
while GPU rendering is active.

Source-only iteration: `scripts/build-source-tar.mjs`. Build the selected image:
`node scripts/build-image.mjs blockwalker` (no --package). Preserve other images,
user browser profiles, native Pi history, `.cache/blockwalker-browser-20260915`
and `build/blockwalker-recovery-20260923/`. Earlier detailed handoff notes remain
in tasks and `build/living-world-20260926/handoff-before.md`. The verified
source checkpoint was reconstructed from `checkpoint.patch`,
`checkpoint-untracked.tar.gz` and `checkpoint-tree.json` (base commit, branch and
archive hashes), with all 66 game sources checked byte-for-byte against the
served source archive. The checkpoint is also named
`codex/blockwalker-checkpoint-20260927`.

Newer, unfinished mechanics edits are preserved in the working tree and
`build/mechanics-20260927/`; they are not in the served image or this checkpoint.
A full backup before checkpointing is under `build/checkpoint-20260927/`.
Projectile tethering, carousel supply, aerial recovery and servo steering have
open `20260927-081800-codex-*` tasks. Continue them from their recorded physical
trials; a passing harness does not mean a mechanism completed its task.
