# Blockwalker handoff

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. Do not modify the parent worktree or
other agents' previews. The broad-turntable/slinger request is complete in image 29. The active goal
continues current issues and a more lively world through September 25, 21:00 JST.
No push or deployment is authorized.

The baseline [September 25 checkpoint](../tasks/20260925-064800-codex-01/TASK.md) packages
91 placements: the original 70, red/blue rival and guard vehicles, warehouse
handlers, a quarry runner and two cores, and two cargo-slinger crews. Cargo and
fallen machines remain physical. All behavior is visible ordinary character
programs using common sensors, actuator keys and radio. No per-character engine
motion helpers. Physics stays at 60 Hz; the later experimental controller rates
and observation caches are excluded.

Image 31 is served at `http://127.0.0.1:9099/blockwalker/` by user service
`dolly-blockwalker-preview-20260924.service`. The owned relay listens on 9010.
The image is 234519771 bytes, SHA-256
`e5f50b7b8d0a95969e718f64d5c6024c06fdb4ff4b15c99420e51e91af5a5a6e`.
Its source archive SHA-256 is
`95bda49c25f255b078f2e11a982585fd15daa190528abce6585ce5db6dabdb0c`.
The [bearing task](../tasks/20260925-080000-codex-01/TASK.md) records current verification. Existing
saved worlds retain their own programs and terrain; loading a save does not
silently replace them with the fresh catalog. Chrome and Firefox both verify
all 93 bundled designs and restore all 125 objects from the populated save,
with no browser errors or model requests. Evidence:
`build/blockwalker-image31-preview{,-firefox}/proof.json`.
Protected originals and all twelve other images pass
`build/blockwalker-image31-preservation.json`.

The fresh 2400 s `build/blockwalker-rivalry-checkpoint42/` run retains 122
objects with 33 unique deliveries and no controller errors. Both quarry cores
complete runner-to-courier handoffs, and raiders tip and recover. Its final
warehouse assertion fails (East 1 / West 2), so do not call it a full pass.
`checkpoint-proof.json` records retention, credit and physical cargo-owner chains.

The final warehouse programs steer using the actual magnet pole, try alternate
pickup routes and avoid previously stored pallets. Kawasemi's flight gains
settle its pickup. A replay of the exact failed world stores all four delivered
heavy loads and delivers Kawasemi's waiting crate:
`build/blockwalker-forklift-pole-pickup/`.
The ore hauler now powers its magnet within sensed cargo bounds, using the
unchanged physical capture query, and rejects the wrong attached target.
`build/blockwalker-forklift-foundry-contact/` continues to 2760 simulated seconds,
125 objects and 37 deliveries. The fifth heavy load reaches the quay; all four
previous heavy deliveries remain stored. All four corrected programs are in the
packaged catalog. This proves saved-failure recovery, not fresh endurance.

Chrome and Firefox builder/world controls pass, including one-way jets,
blocked-nozzle edits, camera shortcuts, following, source export and hiding UI.
Evidence: `build/blockwalker-thruster-ui-{chrome,firefox}/` and
`build/blockwalker-world-ui-{chrome,firefox}/`.
One-way migration preserves original poses, programs, memory and magnets and
backs up the old world; see the [thruster task](../tasks/20260925-035000-codex-01/TASK.md).
The [slinger revision](../tasks/20260925-080000-codex-01/TASK.md) supersedes the
narrow-bearing crews. Turntables offer 1x1 through 4x4 footprints with actual
mounting across both faces; both slingers use two 3x3 bearings. Open-frame masts,
exposed rotors, counterweights and retracting loading pedestals work with compact
shuttles 16 metres away. Only the ten crew/cargo entries changed; the other 81
placements are retained. Magnet damping prevents stationary force-limit jitter.
All controller logic remains ordinary programs; ammo selection excludes heavy
cargo and motor commands stay bounded after disturbances.

The final crew completes three reloads and three physical hits in 360 simulated
seconds, including loaded save/reopen and target loss, with zero crew collisions.
Evidence: `build/blockwalker-launcher-wide-light-only2/`. The final-geometry
populated run retains 96 objects, completes four deliveries, and both crews
reload/fire without controller errors or crew collisions over 180 s:
`build/blockwalker-launcher-wide-final-populated/`. This does not close the
separate freight endurance or crowded-performance issues.
[Rope/winch links](../tasks/20260925-041500-codex-01/TASK.md) remain separate.

The [recovery task](../tasks/20260925-083000-codex-01/TASK.md)
adds two ordinary magnet trucks. The latest isolated 600 s run completes three
recoveries/handoffs/shots, with two hits, loaded restoration and recovery from a
manual magnet-off interruption. No crew contacts/errors occur. Evidence:
`build/blockwalker-launcher-restock-interrupted-reachable/`.
The first full-world trial exposed an enemy guard tipping the truck; ordinary
escape steering fixes that trial without changing the guard. East's crew moves
22 m west into the flight corridor. The final 900 s run retains 108 objects,
records 16 deliveries and four shots per crew, including actual recovered-ammo
handoffs. Zero errors, crew contacts or truck rollovers. Evidence:
`build/blockwalker-rivalry-restock-evade42/recovery-proof.json`. Chrome and Firefox
restore this save and export both truck programs exactly; screenshots and short
FPS samples are in `build/blockwalker-restock-view-{chrome,firefox}/`.
The trucks and relocated Red Sling camera are now bundled in image 30, commit
`108b25d`. The recovery task is closed. Paired Firefox CPU simulation timing
measures about 2.6% added cost for the trucks (106 versus 108 objects):
`build/blockwalker-recovery-cost-firefox/proof.json`; this is not rendered FPS.

The image 29 fresh 2400 s run retains 117 objects and makes 27 light deliveries
but blocks all heavy freight at an upright quay pallet. A 67-part crane with a
higher mast, 3x3 bearing and two lowering rams transfers that exact pallet to the
East barge in 30 s. Slow joint-angle feedback works; head-yaw feedback excites
sway. The fresh isolated 1800 s chain completes two quay handoffs and one West
heavy delivery/storage, but East's receiving crane catches its load on the quay.
Matching taller receiving cranes recover that exact saved failure: East's pallet
reaches its pad and warehouse storage, making 2/2 delivered loads stored. The
fresh six-wheel-hauler trial then wedges at the factory exit before any delivery.
The receiving cranes and hauler remain excluded. Only the verified raised quay
crane is bundled in image 30. Lookahead steering transfers the first load, but the next pickup and receiving
crane still jam. The 26-part wider-front hauler stalls its first pickup with its head too high.
The 22-part tandem-mast hauler with a 1.75 m lift and cargo-support check
completes three trips in a fresh 900 s trial. The quay then cannot reach the
second pallet, and the altered East berth hits the inlet wall. The next candidate
shortens the quay boom and restores the berth to the inlet center. These freight
changes remain excluded until repeated fresh deliveries work for both teams.
Recipes/results: `build/blockwalker-restock/README.md`. The recovery generator
reads a frozen image-29 baseline; do not reapply its edits to the 93-entry catalog.

Lazy-neighbor snapshots and default sleeping each gain only 1–2% in paired
Firefox tests; both are excluded. [Rigid compound assemblies](../tasks/20260925-100000-codex-01/TASK.md)
are a separate lab prototype under `build/blockwalker-compound/`. Its first
Chrome pass restores 2327 blocks as 383 bodies with maximum position error
0.000002861 m, retains all 125 objects through save/reopen and 60 ticks, and
passes momentum, off-center thruster and buoyancy checks. This is not a
performance or endurance result. No compound engine change is bundled.

Compiling unchanged Box3D with its existing Wasm SIMD path cuts paired Firefox
simulation time about 6.8% on the 125-object save. The 900 s full-world repeat
retains 108 objects, makes 16 deliveries and four shots per crew, and produces
an exactly identical final save to scalar. Evidence:
`build/blockwalker-simd-wrapper-firefox/` and
`build/blockwalker-rivalry-restock-simd42/`. Image 31 builds this private library
inside Dolly through `src/blockwalker/box3d.mk` and its balanced target-attribute
wrapper; the ordinary cc driver lacks SIMD flags. This does not meet the
crowded rendered-FPS target by itself.

Outstanding work:

- Repeat a fresh uninterrupted cargo run with the final programs. The
  [warehouse](../tasks/20260924-220500-codex-01/TASK.md) and
  [freight](../tasks/20260924-144000-codex-01/TASK.md) issues stay open.
- [Crowded Firefox performance](../tasks/20260925-010000-codex-01/TASK.md) remains
  below target: 14.66 warm FPS with 125 objects; Chrome views reach 22.65–26.48.
  CPU simulation dominates, with GPU work about 0.35 ms/frame. A transport-rate
  experiment reaches 24.51 warm FPS but lacks complete cargo/flight validation
  and is not bundled. Do not quote older 103-object results for this population.
- Lua/YAML migration, ropes, existing walker limitations and the large-session
  refresh issue are separate tasks, not completed by this checkpoint.

The [overnight issue](../tasks/20260924-211600-codex-01/TASK.md) links feature
and verification tasks. Local experiment artifacts under `build/` are not the
packaged catalog automatically. To rebuild, use `node scripts/prepare-blockwalker.mjs`
and `npm run image -- blockwalker`; restart only the owned preview service.

Preserve `.cache/blockwalker-browser-20260915` and
`build/blockwalker-recovery-20260923/`. The complete native Pi history must not
be truncated. `build/blockwalker-checkpoint-preservation.mjs` checks all six
protected files (392379755 bytes) and the other twelve image entries. The
[large-session task](../tasks/20260923-200000-codex-01/TASK.md) records the
remaining same-tab refresh problem. Recheck ownership before stopping processes.

Compile C inside Dolly. Run one disposable browser tree at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0`, with a bounded
`timeout`. Use `DISPLAY=:1` for Firefox and Xvfb for Chrome. Scripts under the
symlinked `build/` directory need Node's `--preserve-symlinks-main`. Upload USTAR
archives. Never request terminal screenshots while the game owns the GPU.
Do not deep-assert large buffers; use `assert.ok(actual.equals(expected))`.
Animated water invalidates whole-frame equality for camera checks.

Image 31 passed bundled Chrome and Firefox verification: all 93 designs match
and both restore the 125-object world with no browser errors or model calls.
The protected files and other twelve images are unchanged.

Current owned test at 11:39 JST: the telescopic-quay/centered-berth saved-failure
replay, log `build/blockwalker-telescopic-quay-center-berth.log`. Its modifier
replaces the loaded barge's program only, preserving its cargo and pose. The
quay blueprint is rebuilt at its original base, with its narrower reachable
radius. Fresh freight candidate: `build/blockwalker-restock/freight-telescopic-quay.json`.
No other owned browser or queued job remains.
