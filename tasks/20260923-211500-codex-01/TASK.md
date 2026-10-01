# Replace Slopyard JavaScript controllers and JSON game data with Lua

- STATUS: CLOSED
- PRIORITY: 10
- TAGS: game,architecture,scripting

User requested Lua instead of embedded JavaScript and YAML instead of JSON for
Slopyard. The C game currently creates a QuickJS runtime for each movement
controller (`src/slopyard/world.c`). Catalogs, archived designs and world
saves contain JSON, including controller source and persistent controller memory.
QuickJS is also used by the separate embedded Pi integration.

Keep the engine, physics and rendering integration in C. Compile Lua inside Dolly; evaluate dependency size and iteration
cost before adding them. Define one small controller interface for time, physics
sensors, persistent memory, seeded randomness and joint commands. Preserve the
current memory/execution limits and prevent scripts from receiving ambient host
capabilities. Pi must generate and install Lua movement programs through the
same direct game tools.

Convert the maintained and archived character programs and authored catalogs.
Use a data-only Lua table schema with explicit validation and versioning for game
data and saves. Preserve poses, velocities, programs, controller memory, seeds,
magnet attachments and removal history when migrating existing JSON worlds.
Keep original saves recoverable; report conversions that cannot be made safely.
The existing plain-text `.character` format needs an explicit compatibility
decision rather than an accidental format change.

Scope the remaining JavaScript deliberately: game-owned scripting and data are
the target; upstream Pi, its protocol payloads and Dolly's browser runtime are
separate dependencies, not an implicit request to rewrite those projects.

Done when the biped walks, PID vehicles balance, boats sail and cranes handle
cargo using Lua in a real browser; Lua save/reload preserves the same physical
and controller state; older worlds migrate without lost designs; runaway scripts
remain bounded; and obsolete game controller/JSON paths are removed after
compatibility coverage. Record startup, simulation throughput and image-size
measurements against the current implementation.

September 26: user confirmed YAML is optional but JSON must go. Use Lua tables
for catalogs, controller memory and saved worlds. Keep the existing plain-text
`.character` blueprint format; retain a read-only legacy JSON importer with
explicit program conversion and recoverable originals. Current local baseline:
image44 / `31e41cf`, Chrome 49.81 FPS and Firefox 49.40 FPS on the matched
134-object world. New completion target: at least 60 measured rendered FPS on
this machine with the same world, actors and physics settings.

Work in progress, September 26: controllers now use in-sandbox-built Lua 5.5.1,
with Lua table catalogs/saves/configuration. Fresh roster is 81 objects/1,834
parts (was 111/2,703), using 43 programs; old worlds retain their designs through
verified source translations. Local preview still serves image44; do not mistake
prototype results for a deployed checkpoint. Browser experiments and logs are in
`build/slopyard-lua/`.

Verified so far: 130,000 old-JavaScript/Lua command comparisons match exactly;
81,000 curated-controller calls pass; loops, recursion, heap exhaustion, denied
capabilities and serializer cycles are bounded. Fresh-world and seven historical save/reload cases now pass, including exact
controller memory/commands and tolerant physical-pose/attachment comparisons;
original JSON saves remain byte-for-byte unchanged. Old browser harness
conversion is still unfinished. Pi SDK/protocol glue remains
JavaScript; movement/world scripting is Lua/C.

Measured on Chrome with the same 134-object mature world: frame time was 49%
controllers/sensors/actuation, 19% solver, 4% cargo/state, 25% graphics submission
and associated waits, 3% UI/other. Full result: `phases-chrome/lua-performance.json`.
Changing only the experiment's controller rates gives ~31–33 FPS at existing
rates, 64.42 FPS with a blanket 10 Hz cap, and 54.73 FPS with 20 Hz walkers and
original fast launcher rates. Physics remains 60 Hz / 8 solver substeps. No
catalog frequencies had been changed in those experiments.

Eight paired 60-second physical trials (`hertz-chrome/result-hertz.csv`): 10 Hz
keeps the balancing vehicle, survey aircraft, trimaran, salvage boat, crane and
carousel working; controller CPU reductions range from 14% (noisy small crane
sample) to 77% (balance vehicle). Sidelight falls at 10 Hz; Hibari wobbles more.
Both remain upright at 20/30 Hz (`hertz-bipeds-chrome/result-hertz.csv`). These short isolated
trials are not proof that a rate works through every full-world interaction.

User decision: use 20 Hz throughout the current roster. All 81 catalog entries,
new programs, the generic keyboard driver, generated cargo and verified legacy
world/design imports now use 20 Hz. Explicitly configured rates remain supported
by the controller API. Physics stays 60 Hz/eight solver substeps. Lua saves retain
the chosen rate; the original legacy files are untouched.

The 134-object mature world restores every actor and its 78 library entries at
20 Hz and runs without new deaths/controller errors: 43.27 FPS in the first
Chrome sample under concurrent host load (`hz20-chrome/lua-performance.json`).
This is not a matched speedup claim and does not meet the 60 FPS target.
Fresh world plus seven historical saves pass 20 Hz restoration and subsequent
Lua save/reload (`save20.log`). The rendering upload batching experiment was
removed after showing no established gain. Local preview still serves image44.

Ten complex-character trials at 20 Hz pass 1,200 actual controller calls each
over 60 physics seconds, with no controller errors (`hertz20-chrome/result-hertz.csv`).
Both bipeds retain minimum up >0.975; the balance vehicle, survey aircraft,
trimaran, 131-part salvage boat, crane and 93-part carousel remain stable.
The slinger/flak programs also execute without error, but these isolated trials
provide no opponent/reloading scenario and do not validate combat behavior.

SIMD check: Slopyard already builds the Box3D SSE2 path through the
`target("simd128")` wrapper, and the current in-Dolly-built probe declares
`+simd128`. This is the same library present since image31. Historical paired
Firefox data (`build/slopyard-simd-wrapper-firefox/proof.json`) shows 6.8%
less full simulation time versus scalar. Physics uses one worker; the current
controller/render measurements already include SIMD.

Thread investigation is tracked separately in `tasks/20260926-181716-codex-threads/TASK.md`.
The later sensor-arity skip prototype stayed under `build/`; its noisy mature-
world samples showed no improvement, so it was not added to canonical source.

A 1,800-step 134-object replay during thread integration exposed a courier Lua
migration error: a missing missed-cargo cooldown was compared with a number.
The maintained East air courier and both corresponding legacy translations now
use zero for an absent cooldown. The same corrected saved program completes
all six Chrome worker-count trials without controller faults; complete output
saves match across counts. Evidence: `build/slopyard-threads/chrome/`.

The generic thread checkpoint is now verified and previewed on 9097. Normal
in-image Chrome/Firefox runs restore the same 134-object Lua world at 20 Hz,
advance at real time without faults/losses, and measure 93.6/103.5 and
214.0/215.6 submitted frames per second respectively. This meets 60 on that
counter in these samples, but is not a steady 16.7 ms guarantee or a paired
speedup against image44. Named-session game/blueprint save/reload checks pass
both browsers. Evidence: `build/slopyard-threads/image-{chrome,firefox}/`
and `build/threads-game-session-{chrome,firefox}.log`. Remaining old harness
reconciliation is not silently closed by the thread checkpoint.

Checkpoint reconciliation removes the unreferenced old designs.json,
archive-designs.json and driver.js from canonical/bundled source (956,136bytes,
161lines). The maintained catalog is designs.lua; all43 Lua program files are
referenced. Legacy-program translations and preserved user saves remain intact.
The old slopyard-browser harness still refers to a nonexistent archived Lua
catalog; this belongs to the remaining harness reconciliation, not a runtime
requirement to ship the obsolete catalogs.

## Closed (2026-10-01)

Done. Every controller runs in Lua 5.5 (`demos/slopyard/src/world.c`), catalogs
and saves are Lua data tables, and JavaScript remains only in Pi's integration
and the `--integration-check` script. The read-only JSON importer kept on
September 26 was removed in `95e1c42` under the repository-weight decision in
`20260930-100000-audit-64`: no shipped save or fixture used it, and old sessions
cannot load into newer images anyway; that commit's parent can still import a
JSON world and save it as Lua. The open "old harness reconciliation" was the
JavaScript-era browser scripts, removed in `8aeec3f`; `slopyard-browser.mjs` now
runs all 17 maintained fixtures, including `slopyard-controllers.c` (139,000 Lua
calls across the catalog plus loop, recursion, heap and capability limits), and
its driver part saves and restores an edited Lua program in Chrome. The 60 FPS
target was met in the thread checkpoint recorded above.
