# Slopyard development checkpoint

Active overnight work targets 07:00 JST September 28. Source now includes:

- Slopyard branding, exact sensor-distance/render-bounds caches and clearer
  distant shading (`64f4435`). Matched Firefox replay of the actual 163-character,
  20-minute world measures 97–107 FPS; fixed cache captures are byte-identical.
- Verified team rescue, quarry courier and walking-scout handoffs (`e6469eb`,
  `3ad9049`), stable biped motor control (`cfac726`), and safe handling of missing
  courier destinations (`06fa8a2`).
- Safe supported rescue aborts (`5314905`) and centered torso grips (`7000f24`).
  The actual recovered biped subsequently makes ten independently verified foot
  placements with seven alternations and no new recoveries over 180 seconds.
- Bearing alignment before artillery windup (`fb2147e`), preventing accidental
  loaded-round loss while retaining actual ordinary shots and reloading.
- Exact-output boat shore-query prefilter (`fd13951`) and the shed-loader's
  steering/clearance repair (`f0bccd0`). In the populated world the loader delivers
  its actual parcel onto support and the carousel grips the same parcel; all 163
  original actors survive through 1800 seconds, with 172 final and no faults.

Evidence is under `build/overnight-20260928/` and `build/action-front-20260927/`.
These changes are not yet in the served image. Final terrain-9 layout, artillery
supply/boat experiments and tether reuse are still being validated; do not package
unverified candidates. `frontline/layout.mjs` contains the verified Vesper/scout
moves, but its generated catalog is stale pending the final logistics fragments.
A long browser test was interrupted during host-wide memory pressure; its exact
saved continuation passes. `audit-memory-guard.mjs` monitors only the disposable
test scope and closes that browser if host available memory falls below 4 GiB.

The currently served stable image is still the action-front checkpoint below.

Worktree `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`; checkpoint branch
`codex/blockwalker-checkpoint-20260927-action-front`. Built backup:
`build/checkpoint-20260927-action-front/`. Local preview:
`http://127.0.0.1:9097/blockwalker/`, service `dolly-threads-preview.service`.
Refresh for the new catalog; importing a save preserves its embedded programs
and terrain. No remote push or deployment was requested.

## Current world

139 starting characters, 3,254 parts, 48 catalog Lua programs at 20 Hz. Physics
remains 60 Hz/eight substeps/four Box3D workers, with direct WebGPU presentation.
All C/C++ compilation occurs inside Dolly wasm64. Starter Car remains the only
workshop starting choice; other designs are in Design Library. Base colors retain
the muted palette from `6ca3f7e`.

Terrain 8 narrows combat to 64 m, with four guns on each side at x=±52. Each side
has ground Tengu/Hosen stations, a northern roof supplied by an aircraft, and a
southern roof supplied by a car and cable hoist. Eight short loading cranes use
actual magnetic handoffs and move their forks clear before withdrawing. Roof
center bays are empty for supply; reserves sit on ground service lanes.

Six cargo couriers and their scouts cover north, center and south. Couriers use
soft home-latitude preference, shared claims and observed airborne clearance.
Neutral mine machinery, pier crane and shuttle feed competing red/blue crane
boats. Heavy pallets rest on the team boats' decks during transit; telescoping
masts clear the island quay during unloading. Only island deliveries score.
The map sidebar has two pages of shortcuts for the roofs and sea exchange.

Anchored workshop builds can be placed on supported ground or roofs. The full
footprint must fit its team's area; neutral structures belong in the middle.
Preview, collision/support checks, click/Enter confirmation and Escape cancellation
use the actual world. Installed Lua and root height survive saves.

All 87 original catalog slots remain. The two Tengu stations start with separate
Kusari tether ammunition; existing ground tugs, rescuers and scrapyard collectors
remain. No actor-specific engine forces, forced grips, teleports, weakened cargo,
increased controller budgets or removed opponents were added.

## Verification

Evidence is in `build/action-front-20260927/`:

- `full-v5`: fresh 1,200 simulated seconds with final layout and optimized gun
  safety checks; 139 originals retained, 162 total objects, 13 deliveries, 11
  physical shots, zero controller faults/removals. It exposed an empty hoist
  hook jam and stacked couriers, subsequently fixed through ordinary controls.
- `full-v6`: the actual 600 s state resumes for another 600 s with only the two
  hoist and six courier sources updated. Recursive comparison verifies every
  other state field. All 156 starting objects remain; 163 final objects, ten
  additional deliveries, scores 7/15, zero faults/removals. The Red hoist returns
  to service after 9.467 s; both trapped couriers complete further island jobs.
- `full-v6/sea-chain.txt`: the same generated pallet passes porter 34, pier crane
  132, neutral boat 131, Blue boat 134 and receiver 30, scoring eight points at
  1064.633 s. Both islands separately pass the complete physical chain and saved
  continuation in `build/combat-20260927/sea-mine-{v9,red-v1}`.
- Artillery focused proofs cover three ordinary shots at 48.9/54.7 s successive
  intervals, air supply through loader/gun to firing, two real supported car/hoist
  deliveries per side, physical friendly-trajectory refusal and fork withdrawal.
  Gun trajectory optimization cuts measured peak instructions about two thirds
  without increasing the budget or weakening collision checks.
- `air-traffic/{recovery-v1,crossing-v3,regression-v1}` verifies saved contact
  separation and scout-dispatched loaded crossings with retained cargo.
- `placement/ui-v4` verifies actual placement clicks, all-team restrictions,
  supported roofs, collision rejection, cancellation and running installed Lua.
- `local-preview-{chrome,firefox}` verifies actual 9097, terrain 8, all 139
  programs/blueprints, team colors/starting positions, both bookmark pages,
  zero browser errors/readbacks and clean exit. The ten-second Firefox sample
  is about 85 FPS; this is one camera view, not a whole-map performance guarantee.
- `checkpoint-restore` imports the old terrain-7 world through actual Firefox UI,
  preserving its terrain, embedded programs and tether attachments, then resumes
  without faults/removals. `final-scene` captures the populated final world on GPU.
- `package-proof.json` matches all 73 canonical source files and served assets,
  preserves six protected saves and the other catalog entries. `preservation.log`
  verifies 56 other image/runtime assets. Selected image build takes 53.8 s.
  Its landmark check now expects the flattened crane service lane heights.

Snapshot: 252,798,533 bytes,
`9c9941a7f063eccac97109027dda40a49af9c29748e4d6b45d4c56a560b6fe87`.
Source tar: `5908e94ee95f58f20a7896a13914a30d9f11380040cce62c1658c23fffa32016`.
Runtime identity remains
`d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`.

## Preserved work and limitations

Earlier checkpoint branches/backups remain: `...-bases` (`5473f8f`), `...-combat`
(`93d3d3c`), `...-noon` (`10a1422`/`d7dbeb4`), and
`codex/blockwalker-checkpoint-20260927` (`018c5f2`). Full branch names start with
`codex/blockwalker-checkpoint-20260927`; backups live under `build/checkpoint-*`.
Leave other previews, relay 9010, user browsers and games untouched.

Four of eight guns fire in the final 20-minute timeline; loaded stations can
wait for safe opposing traffic. Do not claim every station fires continuously.
Rotated tether-round reuse and artillery encounter frequency remain tracked in
`20260927-081800-codex-projectile-tethers`. Crowded feeder/truck, post-rescue
walking and heavy/wedged rescue tasks remain open. Do not claim the entire
historical Lua suite passes; reconciliation remains `20260923-211500-codex-01`.

Use one disposable browser at a time in a 4 GiB scope with swap disabled. Chrome
uses Xvfb; Firefox uses DISPLAY=:1. Build-folder Node scripts require
`--preserve-symlinks --preserve-symlinks-main`. Never read visibleTerminalText while
GPU rendering is active. Build only `node scripts/build-image.mjs blockwalker`
(no --package), then check preservation and the actual local image.
