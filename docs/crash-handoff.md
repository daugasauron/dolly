# Blockwalker combat checkpoint

Worktree `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`; checkpoint branch
`codex/blockwalker-checkpoint-20260927-combat`. Built backup:
`build/checkpoint-20260927-combat/`. Local preview:
`http://127.0.0.1:9097/blockwalker/`, service `dolly-threads-preview.service`.
Refresh for the new catalog; importing a save preserves its embedded programs
and terrain. The user reports 300+ FPS in Firefox and is happy with performance.
Do not turn separate Chrome stress results into an unsolicited performance task.
No production push/deployment is requested.

## Current world

87 starting characters, 1,956 parts, 45 Lua programs at 20 Hz. Physics remains
60 Hz/eight substeps/four Box3D workers, with direct WebGPU presentation.
All C/C++ compilation still occurs inside Dolly wasm64.

Terrain 6 organizes the existing industrial mainland as the contested cargo
zone between two island bases. Only island goals finish deliveries; mainland
depots are transfer points. Central parcels, mine/foundry supplies, cranes and
boats remain physical logistics. Colored rear lanes and two dry salvage pits
mark the teams' areas. Camera buttons include Combat, both bases, slings and
scrapyards. Old terrain versions retain their geometry and scoring.

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

Evidence: `build/combat-20260927/`.

- `full-v11`: 900 simulated seconds, all 87 originals retained, 103 total objects,
  eight island deliveries, scores 3/12, no controller faults/removals. A launched
  round catches West's skycrane at 99.367 s; East's tug grabs its lowered handle
  at 142.633 s and pulls it toward the ground. The victim escapes and recovers;
  ammunition returns to its bay at 308.717 s. East's collector also captures
  active West Hibari and completes a scrapyard deposit.
- `full-v9`: seven deliveries, scores 10/11, both heavy cargo chains complete
  through hauler, quay crane, boat and island receiving machinery. Opposing
  guards and a flying rescuer physically contest a collector's captured teammate.
- `tether-offset14`: real loader/gun handoff, shot at 105.817 s, enemy latch at
  109 s, ground tug at 166.367 s and programmed supported release at 181.467 s.
- `tether-lifecycle-final`: latest-source regression, physical capture, 34 m
  payout, ground-handle pickup, supported release, sustained recovered flight
  and resumed cargo work. `tether-controls` also checks friendly exclusion.
- `salvage-v2`: two normal physical deposits, healthy/friendly exclusions, no
  repeated pickups, full save/reload and resumed simulation. `salvage-active-v2`
  verifies active overturned couriers recover and are correctly left alone.
- `targeting-v6`: ten physical checks for both guns, trajectory safety, pairing,
  fresh/missing handoff reports and neutral logistics. The 1.4 m off-center
  handoff reproduces and fixes a deadlock discovered in the populated run.
- `local-preview-{firefox,chrome}`: actual 9097 image, terrain 6, all 87 embedded
  programs/blueprints match source, zero GPU readbacks/errors and clean exit.
- `checkpoint-restore` and `noon-restore`: actual Firefox UI imports for new and
  older worlds, retained programs/attachments/terrain and continued simulation.
- `package-proof.json`: 69 canonical sources match served bytes, six protected
  files unchanged, other catalog entries unchanged. `preservation.log`: 56 other
  image/runtime assets unchanged. Selected image build completes in 62.1 s.

Snapshot: 252,605,612 bytes,
`2824088b56994fef0e954aebecf0ca817c15395bd5f73823b9a549ba3a71ed53`.
Source tar: `1b8bc4b3a278d9faac90aa16908a9f4c9bcd7cef1e54cf49b397da2a1f537a42`.
Runtime identity remains
`d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`.

The two new C regressions use the existing runner:
`xvfb-run -a node test/blockwalker-controller-browser.mjs test/fixtures/blockwalker-team-strategy.c`
and the same command with `blockwalker-tether-lifecycle.c`.
They compile inside the image. Do not claim the entire historical suite passes;
combined Lua harness reconciliation remains task `20260923-211500-codex-01`.

## Preserved checkpoints and remaining work

The noon checkpoint is branch `codex/blockwalker-checkpoint-20260927-noon`
(game commits `10a1422`, `d7dbeb4`). Its complete image/source/world backup is
`build/checkpoint-20260927-noon/`. The 07:45 checkpoint is `018c5f2`, branch
`codex/blockwalker-checkpoint-20260927`.
Keep frozen threaded preview 9096, host-module/Lua preview 9098, old image 44
preview 9099, relay 9010 and the user's browsers/games untouched.

Tether reuse remains OPEN in `20260927-081800-codex-projectile-tethers`:
reliable loading after rotated returns and repeated interception need longer-run
proof. Existing crowded feeder/truck, post-rescue walking and heavy/wedged rescue
tasks also remain open. Captures and shots are physical and can fail; friendly
trajectory prediction only knows observed bodies and current velocities.

Use one disposable browser at a time in a 4 GiB scope. Chrome uses Xvfb;
Firefox uses DISPLAY=:1. Build-folder Node scripts require
`--preserve-symlinks --preserve-symlinks-main`. Never read visibleTerminalText while
GPU rendering is active. Build only `node scripts/build-image.mjs blockwalker`
(no --package) for image changes, then check preservation and actual 9097.
