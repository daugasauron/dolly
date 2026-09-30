# Recover fallen walkers with a flying magnetic winch

- STATUS: OPEN
- PRIORITY: 80
- TAGS: game,controllers,physics

Both bipeds fall during ordinary play. Add a flying recovery machine with a
magnet suspended on a rope. It should find fallen friendly/neutral walkers,
approach safely, attach physically, use thrust/winch forces to raise/right them,
lower onto supported feet and release. Coordinate with the walker recovery
controller so a rescue can lead to resumed supported walking.

Use editable generic Lua and ordinary blocks/forces. Do not move bodies, weaken
gravity or label a grip/brief upright pose as a successful rescue. Replay real
fallen Sidelight and Hibari saves and verify stable release plus new supported
steps, then autonomous rescue in a populated world. Preserve save/reload and
Chrome/Firefox rendering. Related gait issue: 20260915-110000-codex-01.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

Implemented: ordinary Tsuru thrusters, winch and magnet find light stalled
friendly/neutral bipeds or wheeled machines. Programs wait for sustained tilt,
choose physical attachment points, hold position after pickup, extract sideways
from nearby walls, unload the rope before release and back off after a wrong
grip. Suspended walkers straighten their hinges and verify support after release.
No engine-side rescue motion or invented support force is used.

Verified in Dolly wasm64:

- `rescue-unload`: actual fallen Sidelight grip 3612.500 / release 3645.867 s;
  upright at 3960 s, gait resumed. Strict clean-step counters remain zero.
- `rescue-extract`: actual West-team Hibari is physically freed after an earlier
  timeout; up.999926 at replay+240 s, released, one assisted recovery. Repeated
  rescue does not prove sustained clean walking.
- `porter-supported`: actual 13.54 kg overturned Mochi grips 7581.550/releases
  normally 7599.667 s, then collects/delivers carousel cargo 7694.233 s. A slack,
  unloaded cable handles resting bodies whose last contact impulse is zero.
- `wrong-grip`: replay reduces 899 incidental carousel hook/release cycles to
  one; the drone then rights Mochi and returns to patrol. Both bipeds upright
  at+180 s, no controller faults/deaths.
- `mature-v5`: full populated continuation completes further recoveries and
  cargo deliveries. Some difficult pickups still reach the 90 s timeout.

Still OPEN: reliable supported walking after rescue, heavy/wedged machines and
all-terrain recovery. Do not count a timeout release or a brief upright pose as
completion. The strict clean-step criterion remains unproved.

Packaged verification: `build-image-v3.log` passes the image's physical checks.
Chrome and Firefox load the actual 9097 preview with 85 canonical embedded
programs, no errors and clean exit (`local-preview-{chrome,firefox}/proof.json`).
Fresh/restored real-time rendering also passes; other 56 runtime/image assets
and six protected save files are unchanged. See `docs/crash-handoff.md`.

Final-run diagnostic at 1,200 s (`checkpoint-fresh/checkpoint-1200.lua`): both
bipeds are upright and unheld with no assisted-recovery state. Sidelight's
clean-step counters are 0/0 despite 18/21 leg lifts; Hibari has 0/1 steps and is
in recovery phase 9. Their underlying gait remains the issue in this snapshot;
it is not evidence of a stopped controller or a rescue-release deadlock.

At the end of `checkpoint-fresh` (2,400 s), both bipeds have fallen again. Tsuru
East records two supported releases of Suzu / terrace runner; later attempts
time out. West attempts Hibari but has no completed rescue. All 103 objects
survive with no controller faults. Keep `checkpoint-fresh/after.lua` as the
current populated recovery reproduction; its actual Firefox UI import and
continued simulation pass in `checkpoint-restore/proof.json`.
