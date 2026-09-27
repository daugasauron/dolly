# Blockwalker base zones checkpoint

Worktree `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`; checkpoint branch
`codex/blockwalker-checkpoint-20260927-bases`. Built backup:
`build/checkpoint-20260927-bases/`. Local preview:
`http://127.0.0.1:9097/blockwalker/`, service `dolly-threads-preview.service`.
Refresh for the new catalog; importing a save preserves its embedded programs
and terrain. The user reports 300+ FPS in Firefox and is happy with performance.
Do not turn separate Chrome stress results into an unsolicited performance task.
No production push/deployment is requested.

The local preview also includes the workshop cleanup after that checkpoint:
fresh sessions open Starter Car; alternative preset buttons are removed and
Design Library remains available. `build/workshop-start-20260927/proof.json`
verifies the default car, removed click targets, library selection and reopening
the saved design in Firefox. Only Blockwalker was rebuilt (62.8 s).

The base palette is now less saturated, with lighter tint coverage so the
original terrain/building textures show through. Actual Firefox base/overview
captures and package verification are in `build/base-colors-20260927/`.

## Current world

87 starting characters, 1,956 parts, 45 Lua programs at 20 Hz. Physics remains
60 Hz/eight substeps/four Box3D workers, with direct WebGPU presentation.
All C/C++ compilation still occurs inside Dolly wasm64.

Terrain 7 stages blue units west of x=-48 and red units east of x=48, with the
96 m wide neutral combat area between them. Muted team-tinted ground, striped front
boundaries, tall gate frames and rear beacons distinguish the bases. All team
blueprints use matching paint with dark metal mechanisms. Guns, loaders and
ammunition begin inside their respective bases. Scouts and guards move toward
the contested middle; captured opponents can still be taken to scrapyards.

Only island goals finish deliveries; mainland depots remain transfer points.
Central parcels, mine/foundry supplies, cranes and boats retain their physical
logistics. The red barge starts in its own channel and follows its inbound sea
route to the shared quay. Truck drop-off bays sit within their loaders' reach;
cable tugs revisit home between combat patrols to rediscover stranded rounds.
Home shows blue on the left, red on the right. Camera buttons distinguish bases,
ports, guns and scrapyards. Old terrain versions retain geometry and scoring.

Kusari is independent four-part ammunition. It stays compact during loading and
flight, magnetically catches opponents, then lowers its winch handle. Ground
characters can grab that handle; Kanagu tugs reel and pull. Supported victims
are released, allowing ordinary recovery. A short cable folded against the hull
stops reeling after measured stalling; long cable jams cannot declare readiness.
Tugs recover missed/spent rounds. Reloading rotated returned rounds remains less
reliable than the first shot and is tracked separately.

Both guns select opposing airborne units inside combat, prioritize cargo carriers
and teammate threat reports, and check predicted friendly/neutral/terrain
intersections before release. Loaders have raised rails, vertical withdrawal,
shape-aware pickup and off-center/lost-acknowledgement retry. Scouts and couriers
coordinate neutral cargo through ordinary team radio; failed courier jobs re-seek
locally instead of returning empty to base.

Kurogane collectors physically lift incapacitated opponents to their scrapyards.
They leave healthy/recovered enemies alone, respect capacity and competing claims,
and release supported loads without deleting bodies. Teammates can contest these
captures through their existing guards and flying rescuers. No actor-specific
engine forces, forced attachments, weakened enemies or teleporting were added.

## Verification

Evidence: `build/base-zones-20260927/`.

- `full-v3/layout-proof.json`: 900 simulated seconds, all 87 originals retained,
  99 total objects, five island deliveries, scores 2/3, zero controller faults or
  removals. All 35 red and 30 blue units start on their own side with matching
  paint; actual artillery poses remain behind their base boundary. Nine red and
  seven blue mobile units reach the contested middle. The quarry runner completes
  a trip, and both barges reach their normal shared-quay waiting/loading positions.
- `team-strategy/inspection.txt`: all ten existing physical targeting, friendly
  trajectory, loader pairing/retry and neutral-logistics checks pass inside Dolly.
- `local-preview-{firefox,chrome}`: actual 9097 image, terrain 7, all 87 embedded
  programs/blueprints match source, both base/gun camera views, no errors or GPU
  readbacks, and clean exit. Screenshots show the separate base colors and gates.
- `combat-restore`: actual Firefox UI imports the previous terrain-6 checkpoint,
  retains its geometry/combat bounds, embedded programs and magnetic attachments,
  and resumes simulation without controller faults or removals.
- `package-proof.json`: all 69 canonical sources match served bytes; six protected
  save files and other catalog entries are unchanged. `preservation.log` verifies
  56 other image/runtime assets. Selected image build completes in 61.3 s.

Snapshot: 252,462,410 bytes,
`a835bf6eb6279f707404f3afd8686659124f5f1cc36705021677c2203cdf0e45`.
Source tar: `0ba676d3822a220355f80f4c417339c5514b510c02f4550738a393adc9bebd42`.
Runtime identity remains
`d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`.

Earlier tether capture/payout/ground pickup/release, cargo-chain and collector
pit-deposit evidence remains in `build/combat-20260927/` and the corresponding
mechanics tasks. Do not claim the entire historical suite passes; combined Lua
harness reconciliation remains task `20260923-211500-codex-01`.

## Preserved checkpoints and remaining work

The previous combat checkpoint is `93d3d3c`, branch
`codex/blockwalker-checkpoint-20260927-combat`, with its complete image/source/world
backup in `build/checkpoint-20260927-combat/`.

The noon checkpoint is branch `codex/blockwalker-checkpoint-20260927-noon`
(game commits `10a1422`, `d7dbeb4`). Its complete image/source/world backup is
`build/checkpoint-20260927-noon/`. The 07:45 checkpoint is `018c5f2`, branch
`codex/blockwalker-checkpoint-20260927`.
Keep frozen threaded preview 9096, host-module/Lua preview 9098, old image 44
preview 9099, relay 9010 and the user's browsers/games untouched.

Tether reuse and artillery encounter frequency remain OPEN in
`20260927-081800-codex-projectile-tethers`. Both slingshots load in the final 900 s
run but neither fires; earlier v2 fires once at an opposing collector from the
same gun position. Reliable rotated-return loading and repeated interception
still need proof. Do not describe quiet loaded guns as proven middle dominance.
Existing crowded feeder/truck, post-rescue walking and heavy/wedged rescue
tasks also remain open. Captures and shots are physical and can fail; friendly
trajectory prediction only knows observed bodies and current velocities.

Use one disposable browser at a time in a 4 GiB scope. Chrome uses Xvfb;
Firefox uses DISPLAY=:1. Build-folder Node scripts require
`--preserve-symlinks --preserve-symlinks-main`. Never read visibleTerminalText while
GPU rendering is active. Build only `node scripts/build-image.mjs blockwalker`
(no --package) for image changes, then check preservation and actual 9097.
