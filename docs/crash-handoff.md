# Blockwalker local checkpoint

Worktree `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. The September 27 noon checkpoint is
`codex/blockwalker-checkpoint-20260927-noon`; game changes are `10a1422` and
`d7dbeb4`. The user reports 300+ FPS in Firefox and is happy with it; focus
on gameplay. Do not describe the separate Chrome stress result as their problem.
No production push/deployment is requested.

## Preview and rollback

Latest: `http://127.0.0.1:9097/blockwalker/`, service
`dolly-threads-preview.service`. The noon checkpoint is built and verified at
this actual URL in Chrome and Firefox. Refresh and start a fresh world for the
85-object catalog. Restoring a save retains its embedded programs and designs.

The 07:45 source checkpoint is `018c5f2`, branch
`codex/blockwalker-checkpoint-20260927`. Keep it unchanged. Frozen threaded
preview: 9096 (`dolly-threaded-baseline-20260926.service`), under
`build/living-world-20260926/checkpoint`. Host-module/Lua preview: 9098; older
image 44: 9099. Preserve these services, relay 9010 and the user's browsers/games.
New 96 m cables require the new image; retain matching saves with older previews.

## Included

85 default objects, 44 Lua programs, all controllers 20 Hz. Physics remains
60 Hz/eight substeps with four Box3D workers and direct WebGPU presentation.
The previous host-module/thread/Lua/world work remains intact.

- Kusari magnetic rounds replace one ordinary round at each slinger. Kanagu
  articulated tugs grasp their trailing handles and pull captured aircraft down.
  Shishi's hovering interceptor is removed from new worlds; old saved copies
  remain valid custom content. Captured aircraft currently remain restrained.
- Tsuru flying winches patrol for light fallen teammates or neutral machines,
  physically lift/right them, unload the cable and release. Suspended walkers
  straighten their joints. Light-vehicle recovery resumes useful cargo work.
- The builder car, Tonbi trucks, Nekote loader and Kanagu tugs use actual steering
  hinges, controlled by visible Lua. The driver's D key turns the Eyes camera
  right. Legacy chassis retain their existing differential fallback.
- Nekote discovers a carousel inlet and supplies it; Mochi collects downstream.
  The continuing chain works in the restored world; fresh crowded routes remain
  unreliable. Four-wheel articulation replaces Nekote's unhelpful tandem axle.
- Generic `s.parts(id)` exposes actual part poses/rotations/actuators/support and
  magnet targets. Nearby queries use horizontal rigid-body distances, preserving
  visibility of remote cable ends. Programmable cargo and 96 m winches save and
  restore correctly. No host authority or hidden movement force was added.
- Selected machines show their Lua activity in the sidebar. Existing terrain,
  cargo supply, guards, boats, cranes, channel flak and the other designs remain.

## Verification

Evidence: `build/mechanics-20260927/`; the four
`tasks/20260927-081800-codex-*/TASK.md` files give mechanism results and remaining
criteria. All C/C++ compilation occurs inside Dolly wasm64.

`body-range-reciprocal.log` verifies actual poses, copied observations, invalid
IDs, reciprocal cable-end range, support, ownership, scoring, reeling and reload.
`driver-corrected.log` exercises real keyboard steering, forward/reverse,
centering, camera, magnet and program import/export/restart/remapped keys.

`checkpoint-fresh`: 2,400 simulated seconds, 15 deliveries, 103 objects, all 85
originals retained, no faults/deaths. Both couriers are grounded by real cables
and upright tugs. West's truck places one crate; East overturns, Nekote has zero
placements and both bipeds eventually fall. East's rescuer completes two light
vehicle recoveries; later difficult attempts time out.
`lost-handle` verifies actual remote-end reacquisition and continued reeling with
simultaneous enemy/tug holders. `mature-v5` completes the restored carousel chain
and rescues, nine additional deliveries in 1,200 s; it preserves legacy chassis.
`backoff`/`backoff-v2` did not resolve crowded navigation and are not shipped.

`checkpoint-chrome`/`checkpoint-firefox`: fresh and restored worlds, 20 real
seconds each across panels/Focus, simulation keeps real time, zero GPU readbacks,
no errors and clean exit. Firefox means 261/247 submitted FPS; Chrome 100/83.
These are frame submissions, not monitor presentations. Integration screenshots
under `checkpoint-scenes` use manually paced frames; their FPS badges are not
normal-play measurements. Screenshots inspected.

Selected image build `build-image-v3.log` passes the required physical self-checks
and finishes in 49.6 s. Its starter-car check now discovers the actual wheel,
steering and camera parts rather than relying on old part indices/differential
steering. `local-preview-{chrome,firefox}/proof.json`: actual 9097, 85 objects,
terrain 5, all embedded sources match, no errors, clean shell exit.
`package-proof.json`: 68 canonical source files match the archive and served
hashes, six protected user files unchanged, other catalog entries unchanged.
`preservation.log`: 56 other runtime/image assets unchanged. Runtime identity is
still `d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`.

## Remaining and current work

All four follow-up tasks remain OPEN: automatic tether recovery/reuse, fresh
crowded feeder/truck deliveries, reliable post-rescue walking and heavy/wedged
rescue. Supporting tasks: gait `20260915-110000-codex-01`, loaded bays
`20260927-074100-codex-loaded-bays`, grounded aircraft
`20260927-063100-codex-aircraft-recovery`. Historical combined Lua harness
reconciliation is `20260923-211500-codex-01`; do not claim every test passes.

`checkpoint-restore/proof.json`: Firefox imports the complete 103-object final
world through the actual 9097 UI; all embedded programs and both tether/handle
attachment chains survive. It continues for 16.4 simulation seconds without
faults/removals/readbacks and exits cleanly. Fresh/restored rescuer screenshots
are inspected. Evidence and the built image are retained locally; no test
browser remains running.

One disposable browser at a time, 4 GiB scope. Chrome uses Xvfb; Firefox DISPLAY=:1.
Node 22 needs `--preserve-symlinks --preserve-symlinks-main` for build-folder scripts.
Never read visibleTerminalText while GPU rendering is active. Evidence runners
are local artifacts; use focused existing tests for further source changes.
