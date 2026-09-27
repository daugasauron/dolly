# Restore inactive cargo links and reduce repeated boat planning work

- STATUS: OPEN
- PRIORITY: 230
- TAGS: game,physics,controllers,performance

Audit the existing dock, foundry/barge, mine/ferry, and rooftop supply roles.
Improve interactions by reconnecting physically useful existing units, preserving
ordinary motor/magnet controls and the current population/performance budget.

Initial evidence: action-front/full-v6 after 1,200 simulated seconds has four
crates set down by Harbor Atlas at x106/z10 but Kawasemi remains at x220 with
zero jobs. Foundry hauler repeatedly attempts ore140 with zero trips; Quay crane
and both island barges consequently receive nothing. Mine porter/ferry are in
active later cycles. Rooftop suppliers correctly wait on full magazines/bays.

Shio's route scoring reevaluates every local terrain box at all 19 candidate
points each 20Hz call. Prefilter conservatively by the entire search radius;
measure ordinary-control equivalence and instructions on actual browser state.

Completion requires actual physical chain progress from the reproduced failures,
source-equivalent optimization measurement, no controller faults or population
increases, and integrated-browser verification. Keep failed attempts as evidence.

The overnight request now also requires both ground and air resupply for every
battery, mirrored Blue infrastructure near x=-40, and recovery of stray rounds
from water. Shared fleets should service observed/requesting stations through
ordinary radio and geometry; avoid one new supplier per gun. Root owns catalog
and terrain9; logistics owns suppliers/loader/hoist and the recovery-boat design.

Measured first browser probe (`build/overnight-20260927/logistics/profile-v1`):
33 actual saved boat states have identical actuator outputs after conservative
shore prefiltering. Mean measured Lua instructions 8,394→7,333 (-12.6%); peak
11,000→9,000. Static single-controller timings include uncached sensor creation
and are not summable game frame costs. The foundry jam is physical: its extended
piston contacts the lift at 81.2 N + 18.2 N. Working old catalog 93d3d3c started the
hauler aligned at x=-46.5; current catalog moved it to x=-52.

The initial terrain-9 supplier fixture (`logistics/supply-v1`) initializes all
six Red/Blue air/car/hoist cases without controller errors and observes correctly
mirrored dock/magazine geometry. It does not prove a delivery: its replacement
compact payload omitted `cargo=true`. The corrected fixture retains that required
catalog field; physical delivery verification remains pending. Shared dispatch,
signed loader/hoist geometry and foundry recovery edits are not yet frozen.

The corrected four-part matrix (`logistics/supply-v3`) physically transfers the
same round air→loader→gun on Red at 84.367 s and Blue at 301.467 s, and
car→loader→gun on Red at 208 s. Blue car navigation and both southern car/hoist
chains still fail; all six cases have zero controller faults/removals. The
proposed air yard at x=±60/z=-48 is obstructed by mine/ridge geometry. Open yards
at x=±80/z=0, with reserves x=±85, pass both air cases. These focused local routes
do not yet establish fleet-wide reachability. The final passive five-part Kusari
requires a new compatibility matrix, including the reflected Blue handle.

The actual saved foundry jam replay (`logistics/foundry-v2`) now backs clear of
the lift, realigns and grasps pallet 140 after 45.483 s. Its next transport leg
still stalls while holding the pallet; this is partial recovery, not a completed
cargo chain. The new northern Blue hoist is staged with an ordinary lateral
piston to clear the mine wall while reaching the existing magazine. Water
salvage boat changes remain private and unverified. Detailed per-station gaps
are recorded in `build/overnight-20260927/logistics/station-coverage.md`.

The final five-part matrix (`logistics/supply-v4`) has zero faults/removals but no
valid complete supplier job. Red air eventually reaches its gun after a timeout
abort, which is not a passing delivery. Its magnetic head grips the rope-handle
body; the aircraft adds payload mass to lift while torque compensation omits the
payload center of mass. Red car makes a supported drop, but loader handoff later
loses grip. Blue car contacts the low curb at (-69,-15); southern Blue car also
clips the foundry corner (-62,82). All exact contacts and failed saves are retained.

The foundry continuation contact probe (`logistics/foundry-contact-v1`) identifies
the second stall: its forward piston pushes at 149 N against the Blue roof pillar
at (-33,7.7,63). The old x=-33 route intersects the pillar. A revised route between
the ore pit and pillar, plus ordinary reverse recovery, is staged for verification.

`foundry-v3/v4` restores the exact failed pallet140 through the physical chain:
truck release1539.933, Quay grip1567.433, West barge grip1601.633, island receiver
grip1911.050, supported release1942.883, eight-point score1943.883. The empty
hauler's return still catches the ore-pit curb, so sustained cycles remain open.
`air-com-v1` verifies supported five-part Red air placement (jobs=1) followed by
loader/gun transfer99.417 s. Blue still aborts with a swinging payload; its later
gun transfer is not a valid delivery. The next fixture requires both supported
supplier completion and the full physical custody chain, and exits nonzero on
an incomplete selected case. `salvage-v1` proves initial buoyancy and an actual
Red pickup42.817 s, but its lift later times out and Blue pickup misses; the
salvage models/controller remain private build artifacts.

The strict final-round matrix (`logistics/supply-v7`) passes only Red air at
87.217 s. Blue's eventual gun pickup follows an aborted flight and correctly
fails; all four cars pick up but fail supported delivery. Limiting ordinary
steering to .4 rad removes the previously measured wheel self-collision. Shared
navigation remains open. Direct four-hoist tests (`hoists-v1`, `hoists-lift-v1`)
prove all hooks grasp, but three rounds catch the roof underside and the fourth
cannot clear the deck at full reel. Ordinary taller masts and greater input
clearance are staged, not adopted. `foundry-v5` exposes a second route clearance
issue: the carried pallet and forward ram reach the south wall before the root's
77 m waypoint; the prior verified pallet delivery remains valid, sustained
return cycles remain unproved.

`foundry-v6` verifies the original saved jam through a complete delivery and
empty-truck return. The exact pallet140 passes hauler1245.483→Quay1452.833→West
barge1485.483→island receiver1795.850; the receiver releases1827.483, the pallet
is delivered and world deliveries increase15→16. The truck returns to search
at(-51.83,54.01), near its original(-52,52) home, without recovery loops. No
controller errors/deaths. The corner atz75 clears both the ore pit and the south
wall; the short reduced proof has generators disabled, so repeated fresh pallet
cycles remain for populated continuation.

`hoists-v2` verifies all four taller, supported masts physically lift and make
supported releases of the final round (jobs1 each). RedSouth reaches its gun
53.667s and RedNorth56.717s. BlueSouth's outer bay is marginal for the loader;
BlueNorth needs hook withdrawal/placement correction. `air-pole-v1` rejects the
pole-only flight correction by strict0/2 failure, so it is not a finished fix.

`foundry-natural-v1` restores the original saved generator seed/counters without
manual cargo creation. Four new pallets are physically collected;165 scores on
East island3029.183s and168 on West3358.383s,176 remains on East barge in transit.
The fourth pickup177 exposes a remaining departure failure: thirteen timed
reverse retries leave a wheel against the loading plinth and the forward ram
against the lift. A distance-based straight withdrawal is staged for that actual
save. The result establishes two repeated complete natural chains, not indefinite
throughput. All22actors remain without faults/deaths.

`air-grasp-v1` proves both final-round aircraft can avoid the free handle: the
actual captured part is0, primary-body mass.6845kg. Both supported delivery
counters reach1 (Red59.8s,Blue55.8s) with no timeout/abort. The full strict
chain remains incomplete because the loader cannot reach the outer Blue deposit
and Red's loader stalls during delivery. This supersedes flight gain tuning;
filtered-offset and added swing-damping variants are not adopted.

`supply-v14` uses the physically measured differential wheel-speed helper and
passes strict Red air→loader→gun at87.217s. Blue air makes a supported job and
loader pickup66.617s, but delivery stalls. All cars grasp; southern Blue makes
two supported placements, while the other routes remain incomplete. Ground
loader staging rejects every candidate; that clearance failure needs diagnosis.
`hoists-v4` gives all four taller hoists a supported job and real loader pickup,
with RedSouth/RedNorth gun custody53.717/56.717s. Blue final handoffs still fail.

`foundry-natural-v2` preserves the exact fourth-cycle jam and rejects prolonged
straight retreat: rear wheels remain airborne while the front wheel binds the
plinth at164N. Earlier pallet176 completes another natural East-island delivery
after receiver release3732.833s, establishing three fresh scored pallets. A
supported set-down/retry is staged; the wedged fourth pickup remains unresolved.
