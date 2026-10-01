# Investigate the Chrome crowded-world frame-rate drop

- STATUS: CLOSED
- PRIORITY: 10
- TAGS: game,performance,bug

The September 27 packaged image passes the short fresh/mature rendering checks:
Chrome 90.32/70.93 mean submitted FPS, Firefox 287.14/195.94 at 1280×720, real-time
simulation, no controller faults/deaths. A longer Chrome session exposes a lower
rate after switching worlds. Do not present the short pass as sustained 60 FPS.

Reproduce with `build/living-world-20260926/final-browser-round.sh` or its final
`endurance-browser.mjs` invocation: packaged image, 750 real seconds fresh, then
load `final-mature-before.lua` (151 objects). Fresh passes at 103.675 mean FPS,
751 simulation seconds, 11 deliveries, all originals retained and no faults.
The first five mature 15 s samples are 34.24, 39.58, 55.29, 49.04 and 39.77 FPS.

At the user's checkpoint request the disposable browser scope was deliberately
stopped. The trailing target-closed error is test interruption, not a game crash.
The mature end-state and final assertions were not collected. Inputs, screenshots,
fresh before/after saves and partial logs remain under
`build/living-world-20260926/final-endurance/` and `final-endurance.log`.

During the dip the scope used about 1.54 GB of its 4 GB limit, with no swap, OOM,
limit events or measured memory pressure. GPU utilization sampled 18%. These
observations do not establish a cause. Compare a direct mature load against the
same load following the fresh session; measure physics, controller, render and
host submission times, process/thread cleanup and background workload before
changing code. Keep one disposable browser and preserve the user's applications.

Complete after reproducing and explaining the drop, then verifying the relevant
fix across a full fresh→mature session in Chrome and Firefox. Preserve real-time
60 Hz physics, 20 Hz programs, four workers, save/reload and all actors. Do not
hide the regression by reducing the world, dropping simulation steps or weakening
the frame-rate assertion. Distinguish submitted frames from display presentation.

The user reports 300+ FPS in Firefox during ordinary play and considers that
performance satisfactory. This issue records a separate Chrome stress-test
observation, not a demonstrated problem in the user’s current Firefox session.
Do not prioritize further performance work over the requested gameplay changes.

## Closed (2026-10-01)

Explained; no change made, following the owner's note above (Firefox runs at
300+ FPS and performance is not to displace gameplay work). The original
inputs are gone, so the drop was reproduced on the current image in Chrome
(Xvfb, RTX 5070) with a 178-actor world saved after 2,400 s of the
living-world audit (`20261001-223000-slopyard-living-world`):

- Fresh world 750 s, then Import world: 26–60 FPS fresh, then 45, 40, 16.5,
  27.5, 19.7, 21.7, 14.4, 8.5 FPS in 15 s samples after the import, while other
  builds raised the host load from 6 to 14.
- Started directly on the same save under load 14–16: 3.6–16.4 FPS, against
  7.1–16.4 FPS for a fresh world in the same session. Switching is not the
  cause; world size and host load are.
- Cause: `game_frame` (`demos/slopyard/src/main.c`) runs fixed 60 Hz physics
  and, when behind, up to six catch-up steps per frame. Without rendering the
  audit's step cost grows from 10.6 ms (139 actors) to 13.3–15.2 ms (176–183
  actors), close to the 16.7 ms real-time budget, so a crowded world on a busy
  host falls behind and each frame then carries several steps.

A fix means making `world_step` (controllers, sensors, solver) cheaper; dropping
steps or shrinking the world is ruled out above. Open a new task with a target
if this becomes a priority.
