# Keep the channel battery supplied after its starting ammunition

- STATUS: OPEN
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
