# Slopyard local checkpoint — September 28

Worktree `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. Local game:
http://127.0.0.1:9097/blockwalker/ (`dolly-threads-preview.service`).
The user requested a stable checkpoint and then explicitly stopped new work.
All agents are finished; do not resume the overnight experiments automatically.
No remote push or deployment was performed.

## Included

- Slopyard name, clearer distant shading, exact observation/render bounds caches,
  and avoiding unused Lua sensor construction. Matched source-only Firefox
  measurements improve the aged 163-character scene from 104–111 to 119–130 FPS
  for the last optimization. The paired simulation has 224,550 identical fields;
  three fixed GPU views are byte-identical across the bounds-cache change.
- Stable walking, useful scout radio, courier handoffs, centered supported rescue
  and safe abort handling. Separate retained physical fixtures verify walking
  after rescue and scout→courier→island scoring.
- Nekote shed-loader routing, foundry→quay→barge→island freight, and Kawasemi
  dock pickup. Kawasemi alone moves to (112, 8, 8); the exact physical chain
  Atlas→Kawasemi→Red island scores at 88.417 s.
- Safe bearing alignment before gun windup and four-part tether recovery.
  The tether fixture verifies ground-handle grip, supported victim release,
  supported folded return at 31.150 s and independent flight at 387.300 s.
  This does not establish repeated reload and firing of the returned round.

The catalog remains 139 starting characters / 3,254 parts, terrain 8, with
20 Hz controllers and 60 Hz physics/eight substeps/four workers. Existing
muted team colors and workshop/library behavior remain. All programs are
ordinary editable Lua; no actor-specific engine forces or forced grips.
Internal `blockwalker` paths and save formats remain compatible. Imported
worlds retain their embedded programs and terrain; start fresh for new content.

## Final verification

Evidence: `build/overnight-20260928/`.

- `checkpoint-full` exposed a gun instruction-budget failure after 300 s.
  The selected fix removes temporary tables from the trajectory intersection
  calculation; 50,000 geometric cases give exactly the same answer. The actual
  240 s state then continues another 360 s in `checkpoint-resume`: all 151
  resumed actors retained, 157 final, nine deliveries, scores 4/5, zero faults
  or removals. Blue Tengu fires twice and peaks at 37,000 instructions versus
  the unchanged 200,000 limit. Only the eight gun source strings changed in
  that saved state; all poses, attachments and other controller state match.
- `local-preview-{chrome,firefox}` verify actual 9097, all 139 source programs
  and blueprints, terrain 8, team colors/positions, bookmark pages, Slopyard
  branding, zero GPU readbacks/errors and clean exit. Fresh 10 s samples:
  Firefox 133.1 FPS on DISPLAY=:1;
  Chrome 51.9 FPS under Xvfb.
- `checkpoint-restore` imports the terrain-7/99-character save through the
  actual Chrome file dialog, preserves embedded programs and tether grips,
  and resumes without faults/removals. The final Chrome/Xvfb run is isolated from desktop input.
- `checkpoint-aged` uses the packaged game in normal Firefox on DISPLAY=:1,
  with all 163 originals from the actual 20-minute world intact. Matched view
  samples are 99.8 / 105.7 / 115.6 / 111.2 FPS; no faults/readbacks/browser errors.
  These are four scene measurements, not a whole-map/browser FPS guarantee.
- `checkpoint/package-proof.json` verifies all 73 canonical sources, served
  assets, six protected saves and other catalog entries. `preservation.log`
  retains 56 other image/runtime assets. Selected image build: 53.8 s.

Snapshot: 252821319 bytes,
`4d0361638996184f75c689952b88850d2d70fb433fcfcebe3ca8a06a37af2f4f`.
Source: `cac8bb61fa96a7e41bd53f994d9df68d66eade0e659e14ec45186af6ba6fe92c`.
Runtime identity remains
`d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`.

## Unfinished work retained

Terrain 9, forward/shared artillery supply, five-part rounds, raised guns and
salvage boats are private experiments, excluded from the built image. Air supply
passes 8/8 isolated custody cases, but fresh ground supply passes only 2/8.
The raised gun passes one load then jams before firing; neither trial boat
completes unloading. A slower tether-descent candidate falsely treated projectile
contact as ground support and was rejected. No capacity or force increases were
adopted. Existing tasks remain OPEN for these physical blockers:
`20260927-215800-codex-artillery-resupply`,
`20260927-204500-codex-logistics-continuity`,
`20260927-081800-codex-projectile-tethers`,
`20260928-013500-codex-artillery-effects` and
`20260927-213000-codex-team-role-reachability`.

Exact sources/results are under `build/overnight-20260927/{logistics,tethers}/`
and `build/overnight-20260928/{boats,gun-clearance,team-audit}/`.
Logistics candidates were archived under `logistics/checkpoint-20260928/` and
four supplier sources restored to proven production versions. Resume those
frozen archives, not old prepare scripts that copy current canonical sources.
Historical suite reconciliation remains `20260923-211500-codex-01`; do not
claim all historical tests pass.

## Preserve and reproduce

Checkpoint branch: `codex/slopyard-checkpoint-20260928`.
Built backup and exact commit metadata: `build/checkpoint-slopyard-20260928/`.
The prior served checkpoint remains at
`codex/blockwalker-checkpoint-20260927-action-front` (`d82ff39`) and
`build/checkpoint-20260927-action-front/`. Older checkpoint branches and
protected saves remain untouched.

Leave other preview services, relay 9010, user browsers/games and the main
checkout untouched. Use one disposable test browser at a time in a 4 GiB
systemd scope with swap disabled. Chrome uses Xvfb; Firefox uses DISPLAY=:1.
Compile C/C++ inside Dolly wasm64, never a host compiler. Build-folder Node
scripts need `--preserve-symlinks --preserve-symlinks-main`. Never read
`visibleTerminalText` while GPU rendering is active. Build only
`node scripts/build-image.mjs blockwalker` (no `--package`), then verify
preserved assets, protected saves and the actual local packaged image.
