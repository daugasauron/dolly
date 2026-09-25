# Keep the cargo world active with recovery and restocking crews

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,content,physics

The renewed user goal is to improve current issues and make the world more fun,
working through September 25, 21:00 JST. The preceding turn completed the broad
bearing/slinger checkpoint (`56f29b7`, local image 29). Continue on the same game
branch; preserve the original saves, full Pi history and other images.

The new slingers work, but each starts with only three crates. Add compact
recovery trucks that gather loose, unscored light cargo and return it to their
team's loading bay. Coordinate through ordinary programs and radio, keep clear
of the loader and arm, and leave cargo physical throughout. Do not create or
teleport ammunition, bypass collisions, or add engine behavior for named actors.
Keep the muted industrial theme and every existing useful design.

Prove actual recovery, deposit, loader pickup and subsequent firing, including
an occupied bay, unavailable cargo, interrupted pickup and save/reopen. Verify
both teams in the combined world and inspect the final content in Chrome and
Firefox before packaging a checkpoint. Keep configured controller rates
explicit and measure the added cost on the crowded save.

In parallel with local design work, repeat fresh uninterrupted freight and
warehouse operation using image 29. The warehouse, freight and Firefox
performance issues remain open until their own completion criteria pass.

The source-only prototype has two 14-part, 20 Hz trucks. The isolated 420 s
settling trial physically recovers three crates, passes all three through the
loader and slinger, and fires three shots with two aircraft hits. All 13 spawned
objects remain; no crew contacts/errors occur; a loaded save/reopen retains its
magnet attachment. `build/blockwalker-launcher-restock-settle/proof.json`.

The first populated run exhausts truck 93's program budget while planning a
pickup at 120.567 s. Incremental A* and one pickup approach per callback address
that without increasing the engine budget. The final route program passes a
420 s isolated replay (three recoveries/handoffs, two shots/hits; third arm starts
spinning at 417.57 s) and 600 s populated operation: 106 retained objects,
12 deliveries, no program errors or crew contacts. Evidence:
`build/blockwalker-launcher-restock-route/` and
`build/blockwalker-rivalry-restock-directed42/recovery-proof.json`.

The populated result is not a completion pass. East recovers one crate but its
loaded slinger misses a target pass while the truck patrols inside the arm's
clearance radius. West fires its starting three crates and retrieves another,
but has not returned it by 600 s. The current replay gives idle trucks more
clearance around tall stationary machinery; job routes still use actual bounds.
Both-team restocking, occupied/missing/interrupted pickup and browser visual/
performance checks remain. No prototype has replaced served image 29.

The 1200 s continuation retains 111 objects and records 19 deliveries with no
program errors/crew collisions, but West's truck tips after repeated failed
routes. Its local intermediate goal could lie inside an obstacle. The revised
A* chooses a reachable frontier node toward the actual destination, and uses
the truck's complete loaded footprint. East's usual opposing flight stays at
least 55.57 m away, beyond the 48 m sensor range; the candidate relocates that
whole crew 22 m west without changing its geometry or other 81 placements.
`build/blockwalker-rivalry-restock-patrol-continued/` preserves the failure.

The stricter truck clearance exposed a separate loader deadlock: a reachable
crate at the slider's endpoint could never satisfy its magnet-on tolerance.
The pickup program now activates inside its actual physical capture range;
magnet force, range and cargo mass are unchanged. The bay moves half a metre
away from the machines. After a real magnet-off interruption during the first
lift and loaded save/reopen, the final 600 s isolated trial completes three
recoveries, three handoffs and three shots, with two physical aircraft hits.
All 13 objects remain; no crew contacts/errors occur. The truck also retrieves
one of its already-fired crates. Evidence:
`build/blockwalker-launcher-restock-interrupted-reachable/proof.json`.
The full-world trace additionally shows the truck abandoning cargo 21 twice as
another machine picks it up (127 s and 234 s), and leaving occupied starting
bays alone. Both-team sustained restocking and visual/performance checks remain.

The first full-world relocated run stops at 85.85 s after guard 72 approaches,
magnetically grabs truck 93 at 70 s and tips it. This is actual enemy behavior,
not a terrain failure. The candidate adds ordinary sensor-based escape steering
while keeping the guard and its physics intact. `build/blockwalker-rivalry-
restock-quay-relocated42/` preserves the failure; the current `restock-evade42`
run also fails explicitly if either truck stays tipped for ten seconds.

The final 900 s populated run retains 108 objects and records 16 deliveries,
with no controller errors, crew contacts or truck rollovers. Both crews fire
four shots, including actual truck → loader → slinger handoffs: East cargo 104
and West cargo 91 (previously fired ammunition). East is returning with another
crate at the end; West is seeking its next one. Evidence:
`build/blockwalker-rivalry-restock-evade42/recovery-proof.json`.

Chrome and Firefox import that 108-object save, render both crews and trucks,
and export both truck programs exactly. No browser errors or model requests
occur. Short view samples are 28–32 FPS in Chrome and 12–16 in Firefox; these
are not warmed performance benchmarks. The existing crowded-performance issue
remains open. `build/blockwalker-restock-view-{chrome,firefox}/proof.json`.
The verified 93-design catalog and relocated Red Sling camera are now canonical
source; packaged-image verification remains before closing this task.

Verified and packaged in `108b25d` (local image 30). Chrome and Firefox verify
all 93 bundled sources/blueprints and restore the older 125-object world without
errors or model requests. The revised Red Sling camera frames the relocated
crew. `build/blockwalker-image30-preview{,-firefox}/proof.json`. Preservation
checks retain all six protected files and the twelve other images.

Paired Firefox timing on the same 900 s saved population measures 1800 ticks:
27.50452 / 27.43956 s without the two trucks, 28.19842 / 28.17654 s with them
(106 versus 108 objects, all other programs unchanged). Their measured added
simulation cost is about 2.6%; all runs finish without errors. This is a CPU
simulation comparison, not rendered FPS. Evidence:
`build/blockwalker-recovery-cost-firefox/proof.json`.

Reopened after the rigid-assembly conversion. The 2400 s populated candidate
retains 127 objects, makes 35 deliveries and has zero crew contacts or truck
rollovers. East completes three recovery-to-loader-to-slinger chains and six
shots; West fires its three initial crates but completes no recovery. Its
truck remains upright, patrols and repeatedly evades enemies. Inspect its
reachable cargo and actual route failures before changing its program or crew
placement. Do not respawn ammo or weaken the opposing guard. Evidence:
`build/blockwalker-rivalry-compound-freight-populated42/recovery-proof.json`.

Trace diagnosis: two of West's three fired crates finish on the seabed; the
third rests near x=0, outside its home patrol. The truck attempts only cargo
21/100/104, with 67 escape episodes and no pickup. Parcel 116 stays at least
48.78 m away, just beyond its 48 m observations. It repeatedly targets cargo
21 during brief releases from the existing gantry. Test broader terrain-safe
patrol or crew placement with real cargo and guards still present, and avoid
continually chasing another machine's transient handoff.

The wider patrol alone does not fix recovery: continuing the exact 2400 s
world to 3000 s completes no further restock on either team. A 60 s sensor replay
shows East holding cargo 103 in wait_bay outside the bay's terrain observations;
West's planner rejects every route because its reachable local area is smaller
than its 24 m frontier requirement. Evidence: `build/blockwalker-rivalry-wide-
patrol-continued/` and `build/blockwalker-forklift-trucks-stalled-sensors/`.

A program-only return-route candidate continues that same 3000 s world, retaining
all poses, memory, cargo and guards. Waiting trucks can navigate toward home;
an exhausted local search can use a reachable point that makes real progress.
At 3600 s East has returned its stranded load and another crate (five recoveries,
eight shots total), with 137 objects retained, 45 deliveries, four heavy loads
stored per island and zero crew contacts, controller failures or truck rollovers.
West still completes no recovery: its conservative escape logic repeatedly
reacts to nearby traffic. This candidate is not yet bundled. Evidence:
`build/blockwalker-rivalry-return-route-continued/`. The next replay tests
closing-speed avoidance and a short wait after another machine releases cargo.

Closing-speed avoidance and wider tangent escapes still leave West without a
recovery in the same 600 s continuation. Considering only an enemy's approach
reduces West's escape loops but sends the loaded East truck into a blocked cave
route; that version loses East's improvement. Neither traffic variant is
promoted. Evidence: `build/blockwalker-rivalry-{traffic-route,incoming-route}-
continued/`. Keep the proven return-home/local-frontier changes separate from
these failed avoidance experiments.
