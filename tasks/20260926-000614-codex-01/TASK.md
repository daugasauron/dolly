# Keep the channel battery supplied after its starting ammunition

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: game,controllers,cargo

Image39/07967f6 adds the channel battery106, shuttle107 and recovery tender111.
The300→660s continuation preserves125 objects, records16 total deliveries and
has no controller errors/deaths, but the tender completes zero transfers. The
battery fires its third starting crate and then waits with no further ammunition.
Baseline raw status1: the four-shot requirement fails. Evidence:
`build/blockwalker-compound-regressions-chrome-battery-supply-baseline/salvage/`.

Tender111 holds a claim on108 while trying an obstructed pickup position. That
claim eventually expires and the shuttle reloads at~350s, so this is delay rather
than a permanent radio deadlock. At660s the tender is chasing114 across the map;
its selected approach points include space that its own clearance check rejects.
The planner can repeatedly choose partial paths toward an invalid destination.

The shed loader105 does complete a covered-scrap transfer:101 then passes to
porter38. Its second load100 waits for a clear unloading bay. Boat94 is trying
to recover fired110 from the channel, retaining the existing salvage interaction.
Do not delete these actors, teleport cargo or bypass safety/physical constraints.

Candidate `build/blockwalker-battery-supply/recovery-clear-picks.js` prunes blocked
pickup positions and rechecks them before routing. The exact300s replay changes
only111's program (`clear-picks-world.json`/`clear-picks-catalog.json`); the served
checkpoint is unchanged. Trial: `...-chrome-battery-clear-picks/salvage/`.

Complete after proving a physical outside-cargo→tender→shuttle→gun→shot chain,
then sustained repeat operation in a populated run. Preserve captures/rescues,
all original actors, editable generic programs and controller execution limits.
Keep failed variants as evidence, not bundled catalog changes.


The clear-picks replay also fails sustained supply: three shots, zero tender
jobs,125 objects,16 deliveries and no errors/deaths at660s. It loads the third
round earlier, but tender111 blocks the gun for35 sampled intervals with eligible
aircraft present (370–540s). The gun correctly obeys its friendly-clearance check.
`gun-holds.py` reconstructs targets/clearance from the recorded physical sensors;
there is no reason to weaken that check.

A second candidate makes the slinger advertise its held cargo while a target is
present, and makes the recovery program yield around allied anchored machines
that advertise such a claim. It uses existing team radio and ordinary wheel
controls; no engine/network/physics changes. Files: `slinger-announce.js`,
`recovery-machine-clearance.js`, `machine-clearance-{world,catalog}.json`.
The300→900s trial changes only106/111 and also exports the660s state for comparison.
Results are below; it remains unbundled.


Machine-clearance replay:127 objects,19 deliveries, no losses/errors at900s.
Third shot at381.467s; the earlier35 sampled loaded-gun/friendly-blockage intervals
are eliminated. Tender111 picks covered scrap101 at~765s, but has not returned.
Raw status1 still reflects missing sustained supply. This is component progress.

The900→1200s bay replay demonstrates the stale destination: baseline keeps
bay[75,28] although shuttle107 occupies its approach margin; the revised program
selects[73.5,28] in the same first2s. It still fails to deliver:131 objects,23
deliveries, no errors/deaths. Truck111 ends near(50.79,4.99), rooty0.824/up0.992,
beside the new slag steps. Its terrain check uses wheel width rather than the
full vehicle envelope. A terrain-clearance candidate uses the full envelope in
its overlap cost and permits paths out of existing overlap. Exact physical
contact confirmation is prepared separately (`terrain-contact.c`).

Completed1200→1500s trial: `...-chrome-battery-terrain-clearance/salvage/`.
Candidate files: `recovery-terrain-clearance.js`, `terrain-clearance-catalog.json`.
Tender111 completes its first job around1480s, releasing scrap101 at
(73.112,0.485,27.948), then selects another load. At1500s all134 objects remain,
26 total deliveries, no deaths/controller errors. The shuttle still has three
jobs and the gun three shots: raw status1 fails the four-shot requirement. This
is component progress, not a completed supply chain. The browser wrapper also
reported an Xvfb cleanup failure after exporting the complete test artifacts.

Resume from this trial's `blockwalker-world.json`; inspect gun106/shuttle107
requests and visibility of101 before changing geometry or controller behavior.
The final candidate tests floor support separately and includes terrain walls
in full-vehicle overlap cost, allowing paths that reduce an existing overlap.
Its expected slag-terrace contact remains an inference until `terrain-contact.c`
runs against the preceding1200s state. Do not report that contact as measured.

Contact probe now passes: `...-chrome-battery-terrain-contact/salvage/` logs
rear wheel17 contacting terrain body(43,.25,17) on113 of120 ticks, maximum677N;
this is the first slag terrace. Rear wheel6 also contacts it twice, maximum970N.
The full-envelope diagnosis is confirmed. A1500→1800s continuation with no new
program edits checks101→shuttle107→gun106→shot. At1500s the tender's final claim
on101 is only5s old, so the idle loader may simply be waiting for expiry.

At the user's checkpoint request, the served image39 still contains none of
these program experiments. Preserve the failed runs. Harness:
`build/blockwalker-salvage-combined-browser.mjs` with BLOCKWALKER_WORLD,
BLOCKWALKER_CATALOG and BLOCKWALKER_FIXTURE pointing at the saved world, candidate
catalog and matching fixture in `build/blockwalker-battery-supply/`.
It compiles and simulates inside Dolly; use the bounded browser scope described
in `docs/crash-handoff.md`.

1500→1800s replay passes: `...-chrome-battery-external-round/salvage/`, raw status0.
Actual cargo101 ownership:107 at1510.800s,106 at1549.850s, released at1574.267s.
The gun records the shot at1574.217s toward59; no hostile/friendly contacts,
nearest root distance2.374m.136 final objects,28 deliveries, no losses/errors.
Tender jobs1→2; loader jobs3→5. This proves one supplied shot, not sustained fire.

Fresh-world combined validation uses `fresh-chain-catalog.json` and `fresh-chain.c`
from the candidate directory. Only53,55,56,106,111 change, combining the isolated
heavy-freight fixes with the resupply fixes. It requires two distinct outside
crates to be magnetically held by111→107→106 and fired, plus a stored heavy load
in each warehouse. It preserves all111 initial actors and rejects controller
errors/deaths. Maximum1800s, earliest successful stop1200s.
At1200s it has4 shots/1 external chain,1 tender job,0/0 warehouse jobs and22
deliveries, with no deaths. First fresh supplied shot is verified; sustained
operation and the combined candidate remained unproven at that point.

Fresh run ends raw1 at1800s:130 objects,25 deliveries, no losses/errors, one
supplied shot and zero warehouse jobs. The first supplied round is air parcel121
at648.250s. Shuttle107 then selects moving ammunition89 as it crosses the pickup
area around907s; by910s it is already out of reach. The shuttle never rechecks
reach and remains in pickup for893s. Its extended arm enlarges the clearance
obstacle, preventing tender111 from reaching any unloading bay with scrap101.
The contact probe shows no terrain obstruction for111 at1800s.

`shuttle-recheck.js` shares a physical reach/height check between selection and
pickup, selects only settled stock, and abandons a target that moves out of reach.
Exact1800→2100s replay changes only107 and passes (`battery-shuttle-recheck`):
101 leaves111 at1857.483s, attaches107 at1875.600s,106 at1915.633s, then is fired
at1933.333s. Tender jobs1→2, loader4→5, gun4→5; all130 actors remain, no errors or
deaths. At2100s the tender is aligning another load for delivery. This fixes the
observed loader deadlock; fresh combined verification is still needed.

Fresh `battery-freight-apron` ends raw1 at1800s:131 objects,25 deliveries, no
losses/errors, three starting shots and no supplied shot. Tender111 collects121
at851.767s and releases it at912.067s, but it settles at(73.213,.485,27.549).
The idle shuttle's pickup workspace starts aroundz27.8; the crate lies outside
its reach. The tender counts the job and excludes the misplaced crate because
its `inBay` check accepts anything within2m. At1800s it carries101 while waiting
for a free bay. The shuttle correctly remains idle instead of chasing121.

Trace: at910s the crate is still atz27.967 while lowering; by915s the retreating
truck has left it atz27.546. The program stops horizontal alignment during
lowering, then releases on support/velocity alone. Moving the bay north1m is
not enough: the existing circular clearance model rejects all three new approach
positions between gun106 and shuttle107. Keep those geometry checks intact.

`recovery-align-lowering.js` continues normal wheel alignment while lowering and
requires position error<.1m, speed<.08m/s and ground support before release. Its
bay classification also rejects misplaced stock outside the narrow handoff row.
`placement-replay.c`/`placement-replay-catalog.json` now reconstruct the fresh
world to the first lowering phase, save the whole world, then compare120s of
old/new programs from that same state. Only111 changes in the paired replay;
require actual121→107→106 magnet handoffs, not just a delivery counter. Active
trial `battery-placement-replay`; export `unload-before.json` and both outcomes.

The matched placement replay finishes raw1. Baseline releases121 outside the
shuttle's reach; candidate retains it for the entire120s. Neither branch achieves
a shuttle or gun attachment. Both preserve all actors with no controller errors
or deaths, minimum tender up0.992410/0.992503. Continuing alignment prevents the
bad release but does not complete delivery. Keep this candidate unbundled.
Evidence: `build/blockwalker-compound-regressions-chrome-battery-placement-replay/salvage/`.

The crate remains suspended with retracted rams: at959.53s its root is0.837m
above the floor, conservative lower bound0.137m, speed≈0.017m/s, and no support
force. `recovery-low-drop.js` permits a small drop only when the existing position,
velocity and ram-settling checks pass and the lower bound is within0.2m of the
floor. The matched909.52→1029.52s replay passes: release941.57s at(73.555,27.977),
then actual121→107 at960.53s→106 at999.53s (sampled);126 objects, no deaths/errors,
minimum tender up0.992507. Baseline still misses both handoffs. Evidence:
`build/blockwalker-compound-regressions-chrome-battery-low-drop/salvage/`.
This fixes the observed placement failure; sustained combined verification is
running as `battery-diagonal-drop` with the diagonal freight route.

The fresh `battery-diagonal-drop` run ends failed at1800s:134 objects,29 deliveries,
four shots but only one outside-supplied shot, no controller errors/deaths and no
warehouse jobs. Its first tender job moves unused starting round110; that is not
recycling. External round125 fires at1361.433s. The four rounds produce19 intended
aircraft impacts and no friendly airborne impacts; sustained supply still fails.
Evidence: `build/blockwalker-compound-regressions-chrome-battery-diagonal-drop/salvage/`.

125 is supported and nearly stationary while lowering, but a radial0.1m release
tolerance delays it for hundreds of seconds. `recovery-bay-tolerance.js` uses
|dx|<0.15m and |dz|<0.1m while preserving the low-drop, speed and ram-settling
checks. Exact1200→1440s `handoff-recovery` passes:125 attaches107 at1219.367s,
then106 and fires at1279.283s. Crane54's edge-grasp fix also passes in that replay;
131 objects, no missing originals/errors/deaths. This fixture verifies handoffs
and firing, not the new shot's impact. Evidence:
`build/blockwalker-compound-regressions-chrome-handoff-recovery/salvage/`.

Fresh combined validation is prepared but not run:
`build/blockwalker-battery-supply/{handoff-recovery-catalog.json,fresh-handoff-progress.c}`.
Use `build/blockwalker-progress-browser.mjs`; its existing in-Dolly download
command exports progress saves while the fixture runs, verified in the handoff
and guard replays. Preserve the failed full run. Image40 bundles none of these
supply/freight candidates; this issue stays open at the stable checkpoint.

Latest fresh1800s run `battery-incremental-fresh` still fails sustained supply:
four shots, one outside-supplied round125, two tender jobs (the other moves unused
starter110). All four shots hit their intended aircraft:14 buffered impacts,
zero friendly impacts.134 objects,31 deliveries, no controller errors/deaths or
missing originals; both heavy warehouses now complete two jobs.

125 attaches111 at740.383s,107 at829.450s, transfers to106 at868.517s, fires at
883.167s and hits aircraft9 at884.567s. Gun ownership changes before its magnet
attachment; the per-tick C chain records that later grip, while5s sensor samples
miss it. The offline `supply-cycles.py` therefore reports zero cycles for this
trace; that sampling limitation does not override the per-tick fixture's one.
No second physical resupply cycle is established.

The tender continues selecting and approaching pickups rather than permanently
deadlocking, but is too slow. Latest evidence and raw failed result:
`build/blockwalker-compound-regressions-chrome-battery-incremental-fresh/salvage/`.
Image41 is packaged with the verified shuttle reach recheck and tender
clearance/drop fixes, alongside the freight programs. Sustained supply remains
open; neither the quota nor friendly-fire clearance has been weakened.

Trace accounting: tender111 spends1400 of1800s in route_pick. In a static replay
of its recorded900s sensor, the planner exhausts223 nodes and follows a three-point
partial path into a dead end. Widening the grid45→65 cells yields the same path;
the bounded search width is not established as the cause. No physical trial of
that wider-grid candidate is warranted by this result.

`recovery-no-dead-end.js` removes the exhausted-search partial fallback; ordinary
progress toward the edge of the search area remains. On the same frozen sensor,
it rejects the approach and selects the next after12.85s of simulated controller
updates. This static result is not a movement or resupply pass.
Prepared physical paired replay, not run: `build/blockwalker-battery-supply/`
`{no-dead-end-catalog.json,pickup-replay.c}`, from battery-incremental-fresh's
progress-chain-0900.json. Change only111, each branch360s; require a new actual
111→107→106→shot cycle, upright tender, no losses/errors/friendly airborne hits.

The paired900→1260s trial is now complete and fails: both branches finish with
130 objects,2 tender jobs,4 total shots and zero new supply cycles. Minimum up is
0.999996/0.999997; neither branch loses actors or produces controller errors,
deaths or friendly impacts. The candidate selects different pickups, but remains
near(71.738,19.987) while planning. Full traces and saves:
`build/blockwalker-compound-regressions-chrome-battery-no-dead-end/salvage/`.
The static planner's223 reachable nodes form an enclosed pocket among broad
machine bounds; removing dead-end paths alone is insufficient. Task062400
investigates actual collision-shape observations. Keep this candidate unbundled.

September26 current Lua roster: gun76/shuttle77/tender81. Detailed observations
and actual shape-based routing remove the old broad-machine-bounds trap. The
remaining1,800s stall was a rail-end pickup: crate61 sits atx75.331 while the
head's maximumx is75.999. The loader rejected its nominalx+1 approach and later
commanded a target beyond its stroke. Clamp both pickup axes to physical travel
and permit the magnet's actual reach margin at that edge.

`build/living-world-20260926/channel-edge` replays1,800→2,700s. Gun/shuttle3→6
shots/jobs, tender2→5 jobs, no faults/losses/deaths. Crate61 passes77→76 and fires
1868.733s. Recovered starter78 passes81→77→76 and fires2086.133s. New parcel93
attaches81 at2129.417,77 at2196.883,76 at2252.333 and fires2254.683. At the end the
tender carries another parcel86 toward its bay. Canonical Lua fix promoted;
fresh combined run and final packaged checkpoint still pending.

Fresh Lua validation `build/living-world-20260926/combined-fresh-v2` now completes
1,800s with seven channel shots, seven shuttle jobs and five tender jobs;
106 objects,17 deliveries,no controller faults/deaths/lost originals. Full
per-tick attachments prove outside rounds61,93 and88 pass81→77→76 and fire at
453.617,660.317 and1119.917s. The tender recovers the fired88 at1263.467s,
passes it back through77→76 and fires it again1558.817s. This establishes
sustained physical resupply and recycling in a fresh populated world. Final
image/render confirmation remains before closing the issue.

## Completion

Final verification (September 27): the selected local image contains the Lua
rail-end and routing fixes. `build/living-world-20260926/long-fresh` completes
7,200 s with 11 channel shots, 11 shuttle jobs and 12 tender jobs. Per-tick
`chains.txt` confirms outside cargo 61, 93 and 59 through 81→77→76 and repeated
reuse of fired rounds 80, 93 and 59. All candidate originals remain, no controller
errors/deaths. This run predates the unrelated final courier ceiling fix.

`final-chrome` and `final-firefox` pass fresh/mature packaged rendering, real-time
simulation, 20 Hz controllers, no new faults/deaths and clean shell recovery.
The source archive matches canonical files and the image is served at 9097.
Sustained physical supply and recycling are verified; close this issue. Broader
team balance and overturned-vehicle recovery remain separate open tasks.
