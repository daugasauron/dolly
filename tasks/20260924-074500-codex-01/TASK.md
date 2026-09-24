# Build an island cargo competition through the industrial mainland

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,physics,world,teams

September 24 steering for the active Blockwalker playground goal: two island
teams compete over cargo from the central landmass. Add abandoned industrial
spaces, elevators and covered passages that make flying alone insufficient.
Explore scout communication, crane/boat chains, parachute deliveries and cargo
emerging from the ground. Different physical weights should reward different
machines. Preserve the existing playable checkpoint and learned saves.

Prototype direction: East and West islands, teal and amber crews, a neutral
industrial mainland. Light parcels descend under parachutes; dense cargo rises
from a factory lift beneath a roof. Scouts report visible cargo over team radio.
Collectors, loading cranes, barges and island unloading cranes cooperate to
deliver it. Weight, clearance, buoyancy and motor/magnet strength determine what
can be carried; do not implement arbitrary bans on aircraft carrying heavy loads.

Completion requires measured end-to-end physical handoffs for both teams,
visible scores and radio activity, varied but bounded replenishment, and actual
terrain collisions matching the GPU scene. Show that a scout discovery changes
another robot's job and that heavy cargo needs the intended chain with the
provided machines. Preserve score, supply timing, radio/job state and loaded
cargo across save/reload. Existing worlds must retain a compatible map and
their complete characters/controllers/history. Verify in the browser, compile
C inside Dolly, keep the one-browser 4 GiB/no-swap constraint, and avoid image
rebuilds until a source prototype earns packaging.

Baseline: `d935654`, image SHA-256
`a01ebdb9e7d33fa2a3deaa462b21a4861b143c754b0f2e09aea5aa3c57f965c1`.
The initial 51-object image was preserved while prototypes ran in disposable
browsers; the current package is recorded below. The earlier playground task is
[20260923-213000-codex-01](../20260923-213000-codex-01/TASK.md).

Implemented source checkpoints: `4c574c9` (industrial map and multi-block cargo),
`d2d3f71` (team radio and scoring), `04fe033` (bounded supplies and receiving yards).
The mainland has a flooded shaft, roofed foundry with broken panels, low freight
passage, turbine ruins and quay. Old unversioned worlds retain map 0; new worlds
use map 1. Imports reject unknown map revisions without replacing the current
world. Aircraft need terrain bounds below their current altitude to check a
whole landing column; the existing ground-obstacle subset remains compatible.

Supplies are seeded and saved: 0.913 kg parachute parcels (maximum six loose),
and 10.952 kg four-block ballast pallets (maximum three). Ore appears only over
a lowered, stationary physical lift platform. Delivered supplies clear after
45 seconds; scores remain. No cargo is teleported between machines. A 47-part
twin-ram lift, 17-part telescopic magnet hauler, loading crane, two deck-magnet
barges and two receiving cranes form the heavy chain. Barges announce readiness
only after stopping and releasing the deck magnet; receiving cranes wait for it.
Light couriers respond to their own team's scouts. Claims retain observed
coordinates when the sender cannot see the cargo. Visibility uses Eyes/root
range and the actual terrain boxes. Each island awards 1 point for light cargo
and 8 points above 8 kg; physical release and settling are required.

Prototype catalog: `build/blockwalker-competition-catalog.json`, 60 objects /
1604 parts. It preserves the 51-object cast, moves two old crates away from new
walls, assigns island teams, equips existing lookouts/aircraft with supply radio,
and adds nine machines. It was integrated after the physical handoff and
controller checks below passed. Generator inputs and intermediate designs are
ignored experiments; only the final designs belong in the source catalog.

Measured evidence (all C compiled inside Dolly, disposable Chrome, 4 GiB/no swap):

- `build/blockwalker-supply-driver.log`: permanent physical/browser checks pass;
  9.992 m driven, 71 Eyes camera samples, actual pickup, no browser errors.
  These include old/new map imports, terrain collisions, multi-block support,
  team isolation, occluded sight, remote scout dispatch, saved radio/jobs and
  invalid radio output/import. The newer descent-bound sensor check is pending.
- `build/blockwalker-supply-view.log`: parcel descent 1.667 m/s, saved midair chute
  and timing, six-parcel bound after 800 s; zero removals. GPU canopy inspected.
- `build/blockwalker-competition-population-fleet900.log`: all original 60 objects
  survive 900 simulated seconds and four process/world reloads. East 12 / West 8,
  13 total deliveries. Both ore pallets pass through lift, hauler, loading crane,
  their team's barge and receiving crane; both barges return. Third load departs.
  Minimum barge up: East 0.94653 / West 0.96450. Segment saves, controller memories,
  physical carrier traces and foot traces are in the matching artifact directory.
  The west courier wedged a rotor under a lintel: this run is not a full pass.
- `build/blockwalker-courier-clearance-descent.log`: the revised courier rejects
  the exact blocked landing column, then accepts another scout report and makes
  a real delivery. Both teams score; remote dispatch, three reloads, zero removals,
  minimum up 0.97921, maximum joint separation 0.04596 m over 485.150 s.
- `build/blockwalker-receive-ready.log`: replay of two docked loaded barges verifies
  both receiving cranes score eight points, including a reload during unloading;
  39.867 s, zero removals, minimum barge up 0.98946.

- `build/blockwalker-competition-population-clearance1200.log`: revised descent
  checks survive 1200 s and six reloads with all 60 original objects present,
  East 21 / West 9, 16 deliveries, both scout-driven air couriers scoring and
  three complete heavy chains. The fourth pallet exposed a loading-crane jam,
  repaired and verified below. Minimum barge up 0.93811.
- `build/blockwalker-payload-force.log`: identical aircraft and flight command
  lift a 0.913 kg parcel to 9.639 m; the 10.952 kg pallet stays at 0.485 m while
  the magnet saturates at 30 N. Both trials acquire the load and have no removals.
- `build/blockwalker-crane-inspect-fourth/`: actual contacts show the stalled
  magnet head pressing against pallet 72 with 87.4 N, while its radial piston
  is at the 1.5 m limit. A staged alignment attempt oscillated and was rejected.
  Greater pickup clearance and a 2 m radial stroke free that exact saved load
  in 25.550 s, including a reload. The next fresh run exposed premature magnet
  pickup of the departing hauler, then undamped pallet swing over the boat.
  The crane now waits for vehicle clearance, powers its magnet near the cargo,
  and damps centering against measured cargo velocity.

- `build/blockwalker-freight-regression-damped.log`: four consecutive heavy
  deliveries, two per team, in 1358.417 s across six reloads. Each pallet passes
  through all five physical carriers in order. East 16 / West 16; zero removals,
  minimum barge up 0.94919, maximum joint separation 0.02891 m. The final
  regression lives in `test/fixtures/blockwalker-competition.c` and can run
  through the existing driver browser harness's optional fixture argument.
- `build/blockwalker-competition-ui-checkpoint.log`: actual Foundry/Quay/East/West
  buttons, lift follow/Eyes and fullscreen focus, score/radio/mass HUD, no browser
  errors. Instrumented 68-object sample: 18.58 FPS, zero GPU readback bytes.
  This harness samples world state every frame; normal gameplay is measured
  separately below. Screenshots and proof are in the matching artifact directory.
- `build/blockwalker-competition-driver2.log`: current permanent physics and
  keyboard/browser checks pass, including aircraft descent bounds. 10.875 m
  driven, 76 Eyes samples, actual pickup, zero removals/browser errors. The
  object-count assertion now excludes replenished supplies while still checking
  the original cast, player and manually dropped cargo.

- `build/blockwalker-competition-controllers2.log`: all 60 catalog controllers
  complete 1000 calls each; a finite controller survives an injected 50 ms wait;
  five runaway cases stop. Trial-memory validation and long-running controller
  clocks round-trip. The older dock courier needed a water-height fallback for
  dry practice; its shared-world inputs and behavior are unchanged.

The earned 60-object candidate became the canonical catalog in `8b34788`. Image 17
was the first packaged competition checkpoint: 232306971 bytes, SHA-256
`525859b01b59aa20c6171f8ee5b2cf2dfc7c26632e525dab220afdd88ee3ef9e`.
The build took 24.4 s, with unchanged runtime and reused dependency images
(`build/blockwalker-playground-image17.log`). Image 16 files remain under
`build/blockwalker-image16-preserved/`; original learned sessions/history and
recovery archives are unchanged.

`build/blockwalker-competition-preview-image17.log` checks the actual 9099 image:
all 60 catalog controllers match, 41 library designs, all original objects remain,
zero removals, no browser errors or model requests. The imported 68-object live
world replenishes to 69 objects and advances 30.083 simulated seconds during
30.024 measured wall seconds. Normal gameplay measures 21.38 FPS at Quay and
21.85 FPS in focus view on NVIDIA Blackwell, with zero GPU readbacks. These are
local measurements, not cross-device performance claims.

Actual X11 desktop checks subsequently measured 60.42 / 61.03 FPS in Chrome
and 56.57 / 58.05 FPS in Firefox (Quay/focus), with visible scenes, real-time
simulation and no errors. The 21–22 FPS figure above belongs to Xvfb. A verified
one-line GPU-provider change improves that virtual-display case to 55 FPS while
preserving normal desktop performance and GPU validation. See the closed
[GPU wait task](../20260924-113600-codex-01/TASK.md).

`build/blockwalker-competition-population-repaired-7.log` passes the combined
trial with a different route seed: 1200 simulated seconds, six process/world
reloads, all 60 original objects intact, zero removals, 22 deliveries, East 21 /
West 10. Three heavy pallets traverse all five carriers in order and score;
the fourth is aboard the west barge. Both air couriers deliver scout-reported
parcels. Minimum barge up is 0.94939 East / 0.95706 West.

A targeted crowded-sensor check then exposed a loading-crane controller error.
The [closed recovery task](../20260924-120900-codex-01/TASK.md) records its repair
in `f2c1d9d`: all three cranes retain suspended pallets through crowded sensors
and reloads, then finish two heavy deliveries per team. The permanent freight
fixture passes 1353.117 seconds, nine reloads and zero removals. All 60 catalog
controllers also pass 1000 calls each in
`build/blockwalker-competition-controllers-guarded.log`.

Image 18 was the packaged crane-recovery checkpoint: 232307762 bytes, SHA-256
`dba39efa290c5578f5c3038bcd568f085ae4a2ba61bfd0b2e40c5628b176a375`.
Source tar: `925b6514a29c6d8f7384866ce6088c59a6e346033a47ff0624a5380f729a53f5`.
The unchanged-runtime rebuild took 23.8 seconds
(`build/blockwalker-playground-image18.log`). The actual served image passes
`build/blockwalker-competition-preview-image18-desktop.log` in Firefox:
all catalog controllers match, 69 live objects, zero errors/removals/model
requests, 56.35 / 58.32 FPS at Quay/focus and 30.2 simulated seconds per 30.02
wall seconds. Original learned sessions and complete native Pi history remain
preserved. The continuing playground task retains the user's 18:00 JST deadline.

The later populated-world continuation exposed a boat traffic jam. Image 19
contains its measured back-off repair; the
[traffic task](../20260924-123100-codex-01/TASK.md) records the exact replay,
ordinary freight regression and served package. The continuing trial checks
further trips after that recovery.
