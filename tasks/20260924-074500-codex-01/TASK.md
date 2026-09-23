# Build an island cargo competition through the industrial mainland

- STATUS: OPEN
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
The current 51-object world remains served on port 9099 while prototypes run in
disposable browsers. The earlier playground task is
[20260923-213000-codex-01](../20260923-213000-codex-01/TASK.md).

First source prototype: a roofed foundry, broken roof panels, viewing gallery,
flooded shaft, low loading passage, turbine ruins and western receiving quay.
World files now identify their map revision; unversioned saves select the
original terrain. A real Box3D drop probe measured old ground at y=0.500, shaft
bottom at -11.500, roof at 14.500, interior/passage/open roof at 0.500. Old/new
world imports and rejection of an unknown map revision passed. C was compiled
inside Dolly; Chrome GPU views are in `build/blockwalker-industrial-3/`, log
`build/blockwalker-industrial3.log` (exit 0). This is not packaged on 9099 yet.

The first hydraulic platform bent upward under its own buoyancy, so the pallet
missed it. An alloy platform, shorter arm, bracing and raised foundation fixed
the physical design without changing global solver settings. The 34-part lift
uses three ordinary pistons within the existing 3 m per-piston stroke limit.
It raises a four-block ballast pallet (10.952 kg) from -7.195 m to 0.698 m;
final height 0.659, maximum joint separation 0.0132 m. A process/world reload at
16 s preserves the loaded lift and its controller; the 45 s trial has zero
removals. Cargo identity is now explicitly restored, support/magnet ownership
works across its parts, and sunken cargo stays salvageable. Evidence:
`build/blockwalker-ore-lift-pedestal.log` (exit 0) and
`build/blockwalker-ore-lift-pedestal/{physics.log,lift-trace.csv,blockwalker-world.json,ore-lift.png}`.
The lift/catalog and its cargo creation are still isolated prototype inputs in
`build/blockwalker-ore-lift-designs.json` and `build/blockwalker-ore-lift.c`;
automatic production, teams, radios and the shipping chain remain to implement.

The factory-to-quay trial now physically completes in 221.2 simulated seconds.
The 37-part elevator hands the same pallet to a 17-part overhead magnet hauler;
it drives around the shaft, through the low passage, and releases it at
(-42.520, 0.485, 110.022). Reload at 16 s; zero removals; maximum measured
lift/cargo joint separation 0.0156 m. A side pickup scraped the load during
turns, so the successful design grips near the pallet centre and uses stronger
wheel motors (60 Nm). Evidence: `build/blockwalker-foundry-chain-overhead.log`
and its artifact directory, including `loading-passage.png`. Prototype source
and blueprints remain under `build/blockwalker-foundry-chain*`; cranes, boats,
teams and supply are not integrated into the default catalog yet.

The permanent industrial regression and existing physical/browser driver checks
pass with the new source (`build/blockwalker-industry-driver3.log`, exit 0):
11.503 m driven, 73 camera samples, real magnet pickup, 53 world objects and no
browser errors. The new regression checks collisions, legacy map compatibility,
non-root cargo support, saved multi-block cargo identity and unknown-map rejection.

Team-radio source checkpoint: controller key objects may include a typed cargo
report/claim/readiness/release. Eyes/root line of sight is tested against actual
terrain boxes; messages are team-local and carry observed coordinates rather
than live remote positions. Team membership, bounded radio history and existing
controller jobs round-trip through world files. Island depots award 1 point for
light cargo and 8 for cargo above 8 kg; scoring uses the island receiving it.
The world HUD shows team scores and recent radio messages, and has a Foundry view.
Multi-block magnet cargo also exposes support across its whole assembly,
excluding contacts against itself and its holder.

`build/blockwalker-radio-driver.log` passes the complete existing source/browser
check plus real scout-to-distant-carrier, blocked sight, team isolation, stale
coordinates, restored radio/jobs, and invalid radio import/output cases:
10.948 m driven, 77 camera samples, actual pickup, 53 objects, no browser errors.
`build/blockwalker-driver/car-follow.png` was inspected. The default catalog has
not yet been assigned teams; supply and the full shipping chain remain pending.
