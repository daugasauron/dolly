# Blockwalker

Build walkers, boats, flying machines and anchored structures from boxes and
mechanical servo joints. The workshop opens with a small four-wheel car with an
Eyes block and front magnet. A four-joint starter, an eight-joint quadruped and an empty grid are also available. There is no
automatic gait or balance system.

The C program uses the same raylib and Box3D libraries as the gamedev image.
Box3D runs fully 3D physics in Wasm on the CPU, with the existing serial,
non-SIMD build. A WGSL shader renders oriented boxes, faceted servo housings, lighting
and shadows on WebGPU. A bounding-volume tree accelerates ray intersections. Raylib draws the editor panels in Wasm; those pixels
are uploaded when the controls change. Ordinary frames have no GPU readback; agent observations explicitly capture a cropped PNG.
This is a renderer for this box game, not a general GPU backend for raylib.

| Action | Control |
| --- | --- |
| Place a box or joint | Choose the part, then click a face or side of a joint |
| Select / erase | Pick or Erase tool; V / X |
| Orbit / zoom / recenter | Camera buttons, right-drag or Alt + left-drag / scroll / H |
| Edit a joint | Pick it, choose X/Y/Z, click each key to rebind |
| Test / return to editor | Test character or Enter / Escape |
| Ground / water trial | Test surface button in the header |
| Anchor a structure | Select the starting block and toggle Root anchored |
| Density / appearance | Inspector Mass buttons / finish buttons beneath the palette |
| Undo | Undo button or Ctrl-Z |
| World / workshop | World button |
| Enter your character | Drive in world; Escape returns to the workshop |
| Drive the starter car | WASD; E powers its magnet, Q releases cargo |
| Eyes / outside camera | Backslash while driving or following a character |
| Keep / reopen a design | Design library → Save current / Open; a controller is optional |
| Share a design | Workshop Export / Import, including its controller |
| Restore a population | World → Export world / Import world |
| Browse earlier experiments | Design library, then Older prototypes |
| View every actuator while testing | Arrows beneath the joint controls |
| Play a saved controller | Test character, then Play program; Stop program or backtick returns manual control |
| Pi panel | Pi button or Tab |
| Agent / player joint controls | Backtick key; taking control pauses Pi |
| Leave the editor | Escape, returning to Slop |

A regular block welds to every face-adjacent rigid block, including thrusters
and magnets or Eyes. Hinges, pistons, wheels and turntables keep explicit parent/child attachments;
leave clearance between their moving rigid assemblies to avoid welding them
together. A joint block carries its attached branch. Two keys drive
opposite directions. Deleting a block removes its branch; Undo restores it.
Blueprint storage and GPU buffers grow with the design; there is no 64-part ceiling. Test mode leaves the build pose unchanged. Its camera follows root movement while
keeping the chosen offset, so a tall crane stays framed above its base.
The camera can orbit almost directly above or below the character. The floor
is hidden from below so you can attach parts underneath. Servo joints use
24-sided cylindrical collision shapes and the same nominal mass as boxes.
Their rotating pointers, fixed scales and red travel-limit arcs show the angle.
Standard alloy boxes and servos weigh about 0.91 kg. Gravity is 4 m/s² and the character starts just above
the floor, giving time to try the controls. Hold a joint's keys to turn it;
release them to brake. Highlighted keys and joint angles show the response.

When viewing the world, WASD moves the camera horizontally, Q/E lowers/raises it, and
Shift moves faster. Right-drag or Alt-drag orbits; scroll zooms; H returns home.
Click a creature's name to visit it; Backslash switches to its Eyes while its
program keeps running. WASD leaves the ride-along view. World and workshop cameras retain separate
positions when switching views. Typing a Pi prompt does not move the camera.
Pi's camera tool can also target explicit x/y/z coordinates.
The world sidebar jumps to the harbor, islands, foundry, shipping quay or whole map. Page
buttons or scrolling the creature list reach the full population; visiting a
larger creation fits the camera to its current physical bounds.

Eyes provide a first-person camera at the block's outward face. Its axis and sign
set the view direction; the camera follows the block's actual rotation. Entering
the world adds a manually controlled copy alongside the existing machines.
Wheel driving uses physical differential motors. Other actuators retain their
assigned keys. The starter's editable embedded program translates WASD into
those motor commands; Program displays and exports its source. Driving hints show
the character's movement mode and magnet bindings. Without Eyes, entering a character uses the follow camera.

The part palette also has telescoping pistons, one-way thrusters, wheels, magnets and turntables.
Pistons move their attached branch along the selected axis and sign; the palette
starts them pointing outward, and the inspector can reverse that sign; their travel limit
is in metres. Thrusters have one firing key and coast when released. Axis and sign select
the nozzle face; force acts in the opposite direction. That face must stay clear
of adjacent blocks. Reverse thrust needs a separate opposed jet. Wheels have centered cylindrical collision shapes, a 0.7 m
radius, 0.7 m width and unlimited motor rotation. The larger radius keeps a
same-height chassis off the ground. Attach wheels as leaves: anything beyond them rotates too.
Turntables are thin motorized discs with continuous rotation. Attach a branch
to the disc and mount it on a servo hinge to tilt the spinning assembly.
Thrusters have one firing key; other actuators use a pair of assignable keys. The inspector shows speed, stroke
or force in the relevant units. Version 7 blueprints enforce one-way jets and exhaust clearance. Older builds
upgrade to real opposed jets while retaining their keys and original body indices.
Blocked engines become structural mounts with a new adjacent engine in a clear
position. World format 2 records these parts; automatic upgrades back up the old
world first. Added engines have mass and can change a controller’s tuning. The agent JSON API
defaults to direction +1 and accepts -1.

Magnet blocks attach rigidly and attract other dynamic bodies within 0.65 m of
one face. Choose that face with the axis and sign controls. The On key latches
power; the Off key releases it. Cyan means powered, amber means holding cargo.
Holding force is adjustable from 2 to 100 N. A spring and damper pull at the
contact point with an equal reaction on the crane; overloads can pull free.
Magnets ignore their own character and static terrain. All three block materials
are magnet-compatible in this game.

In practice, Drop cargo puts a loose crate beneath the first magnet. Reset
restores these crates to their starting positions for repeatable trials. In the
world, Drop cargo or C places a persistent crate at the camera target. Pi can
use `drop_cargo({x,z,world:true})` for world cargo or omit `world` and specify an
optional `y` in practice. Power and attachment references survive world saves.
While driving, C drops the crate ahead of the Eyes camera. Carry it to a striped
depot, release it and
let it settle for a second. Each crate scores once after transport from outside
that depot; simply spawning cargo there earns nothing. Delivered crates turn
green. All delivered cargo remains physical and can be moved into storage.
Magnet pickup and riding on a deck both identify the
carrier. The delivery record and your total survive saves and rebuilding your car.
The sidebar and focus HUD show whether the magnet is powered or carrying cargo.
Your deliveries also show a confirmation naming the depot and updated total.
Cargo can settle on the depot floor or stack on previously delivered crates.
Postbird picks up accessible island cargo, delivers it to a clear compatible
depot, then searches for another load. It avoids the receiving crane's working
area and cargo already delivered or held by another machine.

Material 0 is alloy, 1 is a sealed hull with one-quarter density, and 2 is ballast
with triple density. Eight volume samples per body apply buoyancy and drag at
their actual positions; hull placement and centre of mass determine stability.
The sea and GPU surface use the same waves. This is sampled rigid-body buoyancy,
not a particle-fluid simulation. In the initial catamaran, low stern thrusters
gave substantially steadier propulsion than high-mounted engines.

The shared world spans 512 metres. Its original 200-metre ground is surrounded
by sea, stepped islands and docks; rendered solids share the collision geometry.
The harbour is near x=112,z=20, open-water trials at x=125,z=10, and the eastern
island at x=170,z=30. `reset_practice({sea:true})` chooses water; `program_trial`
keeps the selected surface unless `sea` is supplied. Anchored blueprints pin the
root to the terrain and leave the remaining bodies and joints physical.
Finishes 0–3 select plain, panelled, indicator trim or hazard stripes without
changing the physics.

New worlds use an industrial mainland with a flooded ore shaft, roofed foundry,
low freight passage, turbine ruins and shipping quay. East's red crew and
West's blue crew compete to deliver cargo to their islands. Light parcels
descend under parachutes; dense ore appears on the lowered factory lift. The
provided aircraft can carry a 0.91 kg parcel but cannot lift an 11 kg pallet
with their 30 N magnets. Stronger player-built machines remain possible.
The heavy chain uses the lift, a telescopic hauler, loading crane, deck-magnet
barge and island receiving crane. The hauler takes ore, waits for a clear loading pad, and
barges take turns at the berth. Cargo travels through physical handoffs.
An island delivery earns one point, or eight above 8 kg. At most six undelivered
parcels and three ore pallets remain active. New drops use distinct sites until
their earlier parcels are collected, keeping difficult salvage from crowding out
all exposed deliveries. Scores and supply timing survive
saves. Older worlds retain their original terrain instead of gaining walls
around existing machines.

Team scouts report visible cargo; air couriers choose jobs from those reports.
The sidebar shows scores and recent radio traffic, filtering to the followed
character's team. Camera shortcuts visit the foundry and both receiving yards.

The late-1990s PlayStation art direction uses muted industrial paint, coarse
surface detail, a 640×360 scene raster, 5-bit color dithering and coastal haze.
Editor controls retain their full resolution. The dock, quarry and island
machinery share the same material palette.

Pi receives horizontal distance, speed and torso orientation as well as timed
GPU images. Its goal is actual legged walking before exploring other moving
creatures; surviving in place or driving on wheels does not count as walking.

The design library keeps blueprints with their optional controller, anchor,
materials and bindings. Save current also works for unprogrammed hand-built
characters; those entries are marked manual. Releasing identical copies keeps one library entry; a
fallen creature remains available to reopen. Existing world saves populate the
library on first load. Library data lives in `blockwalker-world.json` alongside
the population, so exporting the world also preserves its designs.
The initial layout can place several copies of one design. Each has its own
world identity, physics and controller state while sharing one library entry.

The catalog preserves the learned patrol
biped, larger walkers, balance surveyor, aircraft and cargo machinery, plus
small roaming lookouts, a hydraulic yard porter, channel skiffs and the island
freight fleet. Nineteen
earlier experiments, including the retired drawbridge, are available only through
Older prototypes. On first launch the catalog populates
the world, with loose cargo for the cranes; click World to visit. The balancing
surveyor, aircraft and two survey boats choose varied destinations and respond
to nearby bodies. Amberguard and Marrowstep choose flat destinations around home, slow
to turn and replan around nearby bodies. The beacon tracks nearby machines. Sidelight uses longer, varied patrol distances and reverses at a stable
stance when traffic or a terrain edge blocks its next step. Five Komame lookouts
roam the yard and three islands, turning their physical Eyes heads toward other
characters. Mochi lifts loose crates with its piston and magnet, drives them to
the Works yard depot, then searches for more, steering around deposited cargo. Harbor Atlas salvages floating
cargo into the harbor depot with its magnetic head. Tsubame tows floating crates
to the crane, releases them within reach and backs away for the handoff.
Brinehook raises submerged cargo onto its tray; Kawasemi collects the released
crate and flies it to the Island depot. The gantry then collects its next crate
while the courier is away. The small lookouts steer around loose and delivered cargo, and move clear of
nearby machinery rather than waiting in its path.
Three small Minamo skiffs and the larger patrol boats choose water routes around
the coasts. Twinspire steers around loose cargo to leave it available for salvage.
Skybarge samples nearby ground height to climb before crossing quarry ledges.
Controllers run without Pi or model access.
Existing saves keep their population, including an empty world.
The East landing site, West reactor and North signal station have matching
physics and GPU geometry, with matte panels, lit markers and solar-cell surfaces.
Overhead structures collide with bodies while leaving the ground beneath them
available for walking; the `ground` sensor reports the highest surface below
the character, ignoring overhead boxes. Cargo stays buoyant under piers.
Opening one restores both its body and program; water examples select sea trials.
Play program runs the controller continuously without starting Pi. Stop program
or backtick returns the joints to your keys. Pi can use `design_library` and
`open_design` to reuse and improve earlier work instead of reconstructing it.

The working blueprint is `/workspace/blockwalker.character`, reloaded when
the program restarts. Workshop Export downloads `blockwalker-design.json`,
containing the blueprint, optional program, frequency and test surface. Import
restores those together and also accepts older `.character` blueprints. Invalid
files leave the current design and program intact. The design format is
`blockwalker-design`, version 1, with `source: null` for a manual design.

Pi is embedded in the game process through the QuickJS userspace library.
Its tools call C functions directly: build, observe, reset, hold/release joint
keys, install a controller and release a creature. A practice trial returns
three GPU framebuffer images at start, midpoint and end, with measured poses.
Only the three latest images remain in model requests; older measured states remain.
Practice pauses while the model thinks; the populated world keeps simulating.

Open Pi, import the private `models.json` printed by the local relay, then Start:

```sh
node scripts/codex-relay.mjs 9010 http://127.0.0.1:9099 http://localhost:9099
```

Import again to replace the proxy settings. The game pauses Pi, validates the
file and reports the result; cancellation or invalid input keeps the existing
settings. Start reconnects with the saved conversation.

The model is `codex-local/gpt-6-astra`, xhigh effort, using the subscription
proxy. The Pi panel shows streaming traces and accepts messages with Enter;
a message steers a running turn. Pause aborts inference. Idle turns receive a
continuation prompt. Configuration and Pi sessions live under
`/workspace/blockwalker-agent`; credentials are never baked into the image.
A built-in Pi extension summarizes the conversation in one concise checkpoint,
using the same Astra/xhigh model. Exact designs and the current controller stay
available through the game tools; the full native conversation stays on disk.
Incomplete summaries are rejected. The browser/relay deadlines remain unchanged.
Pi's main module is loaded before its SDK to avoid a QuickJS cyclic re-export
resolution failure; no upstream Pi source is changed.

After experimenting with the keys, Pi installs a JavaScript controller:

```js
function(t, sensors, memory, random) {
  if (memory.phase === undefined) memory.phase = random();
  return (t + memory.phase) % 1.2 < 0.6 ? "AW" : "QS";
}
```

Controllers default to 10 Hz; `program` can choose `hz: 1` for inert or slowly
changing programs, or `20`, `30` and `60` for feedback control. Saved programs
retain their configured rates. They run in separate bare QuickJS contexts with no I/O or game API. A string holds keys at full
strength; an object such as `{A: 0.35, S: 0.6}` applies proportional output.
Opposite key strengths subtract. Values must be finite numbers from zero to one,
and every key must be assigned. Output scales motor target speed or thruster
force, within the part's configured limits. The C physics still runs at 60 Hz.
`inspect_program` reads the currently installed source and rate without changing it.

`release_creature` accepts `team: 1` for East, `2` for West or `0` for neutral.
Shared-world controllers may include `radio: {kind, cargo}` in an output object.
Kinds are `sight`, `claim`, `ready` and `release`, limited to one message per
sender every three simulation seconds. Sight and readiness require cargo within
48 m with terrain-clear visibility. A claim or release may refer to a recent
team report, retaining the reported coordinates when the cargo is unseen.
Radio is team-local and bounded; neutral characters have no team channel.

`program_trial` tests the installed program from a fresh practice drop, at its
chosen rate, with fresh memory and up to three timed GPU pictures. Simulation
pauses after the trial. The same controller implementation runs released creatures.

| Sensor | Meaning |
| --- | --- |
| `blueprint` | The character's part properties, axes, geometry and assigned keys |
| `input`, `pressed` | Held and newly pressed pilot keys; empty for autonomous characters |
| `dt` | Seconds between controller calls; use it for integration |
| `x,y,z`, `vx,vy,vz` | Root world position and velocity, metres and m/s |
| `rotation` | Root quaternion `[x,y,z,w]` |
| `angularVelocity`, `gyroscope` | World and body-local XYZ angular velocity, rad/s |
| `gravity`, `localVelocity` | Body-local XYZ gravity (m/s²) and velocity (m/s) |
| `up` | World Y component of the body's up direction |
| `mass`, `centerOfMass` | Total mass in kg and world XYZ centre of mass |
| `positions` | World centre of mass of each part, indexed by part |
| `angles`, `rates` | Joint position/speed, radians and rad/s; pistons use metres and m/s |
| `touching` | Per-part contact booleans; includes other bodies and the floor |
| `contactsReady` | Whether a solver step has populated contact readings |
| `ground`, `waterHeight` | Terrain height and wave surface under the root; water height is available in sea trials and the shared world |
| `magnets` | Per-magnet `power` (0–1), `attached`, target `creature`/`part`, `load` (N), `targetMass` (kg), `targetSupportForce` (N) and `cargoSupportForce` (N); the latter sums external upward support over all cargo parts, excluding its own parts and holder |
| `submerged` | Per-part fraction in water, from 0 to 1 |
| `id`, `cargoDelivered` | Shared-world identity and lifetime delivery count |
| `nearby` | All objects within 48 m, nearest first, with pose, root velocity (`vx`, `vy`, `vz`), bounds, mass, team, `up`, `fallenSeconds`, `controllerStopped` and cargo state; `carriedBy` identifies the carrier, `magnetHeld` distinguishes grip from riding a deck, and `visible` reports terrain-clear sight; `supply` is 0 (manual), 1 (parcel), 2 (ore) or 3 (mine sample); empty in practice |
| `groundSamples` | World XYZ terrain samples, eight compass directions at 6 m then 16 m, beginning at +Z |
| `terrain` | Terrain bounds within 24 m horizontally: `x/z`, `halfX/halfZ`, `low/high`, including below an aircraft; check the whole landing column |
| `obstacles` | The terrain subset whose top is at least root Y minus 0.2 m |
| `depots` | Delivery areas with name, x/z, radius and team |
| `team`, `worldTime`, `radio` | Team identity, shared simulation clock and recent team messages; message times use `worldTime`, not a newly released controller's age |

Vectors are three-element arrays. Initial body axes are +X right, +Y up, +Z
forward. For a two-wheel vehicle facing +Z with axles along X,
`Math.atan2(s.gravity[2], -s.gravity[1])` measures signed pitch and
`s.gyroscope[0]` gives pitch rate. Controller memory can hold an integral term;
there is no built-in stabilizer. A browser experiment with three vertical boxes
and two wheels recovered from a drive pulse using pitch, pitch rate and velocity
feedback; the same body with feedback disabled fell. The integration check also
runs a four-thruster PID platform, changes its target altitude, applies asymmetric
thrust, and verifies recovery and saved-world continuation.

Check for missing observations before using a saved object ID: objects beyond
the observation radius leave `nearby`. Use the actual magnet attachment when
deciding whether a pickup succeeded.

Each controller has a seeded random function, 4 MiB memory and an interpreter
execution budget. A failed controller stops its commands and retains the body,
source and error. Shared Box3D physics allows creatures to collide. Fallen or
sunk machines remain, with their programs running; recovery requires actual
actuator forces or help from another machine. Only nonfinite poses or escape
below the physical world remove a body. World observations include
the latest eight `recentRemovals`, with cause, controller error, lifetime and
last position/orientation. The world file retains the complete removal history.
Older removals without those records have an unknown cause.

The world autosaves to `/workspace/blockwalker-world.json`, including blueprints,
programs, controller memory/seeds, held commands, ages, poses and velocities.
Restarting restores joint readings immediately. The first real physics step
holds saved commands to rebuild contacts; subsequent controller calls receive
the actual elapsed simulation time in `dt`. Older saves without stored commands
start that step with neutral inputs. Export world downloads this file. Import
world validates and replaces the population and library while keeping the
workshop design and controller. It preserves cargo credit and magnetic loads;
invalid files or failed writes keep the previous world. The last replaced world
is backed up at `/workspace/blockwalker-world.previous.json`. Tagged `blockwalker-world` version 2 exports and older version 1 exports
are accepted; old thrusters are upgraded during import.

These working files and the library live in the current Dolly session. Downloads
survive a fresh start. **Save** at the bottom right keeps the latest file checkpoint,
including Pi's settings and conversation, in this browser. World checkpoints
update every ten simulation seconds and after edits, cargo drops or exports.
Save again to keep later progress; the dialog links to saved sessions. Ctrl+Shift+S
updates the named save. A failed save preserves the previous one. WebGPU renders the
islands, moving water, stars, moon and thruster exhaust.

```sh
node scripts/prepare-blockwalker.mjs
DOLLY_BUILD_IMAGES=blockwalker node scripts/generate-routes.mjs
DOLLY_BUILD_IMAGES=blockwalker DOLLY_SNAPSHOT_IMAGE=blockwalker node scripts/build-system-snapshot.mjs
node scripts/serve-gpu.mjs 9099 blockwalker
```

The single game [Dollyfile](../Dollyfile-blockwalker) reuses `gamedev-sdk` and Pi/JavaScript build outputs, compiles
the C sources inside Dolly, and runs `blockwalker --check` against actual
Box3D motors in both directions on all three axes, braking under gravity,
four-wheel driving and reversing on the floor, finite magnet pickup/lift/release,
overload, removed targets, and 40 seconds of joint/weld/floor stability. `test/blockwalker-browser.mjs`
drives camera controls, the editor, key assignment, export/import, physics
and restart in Chrome, including a 160-part design.
`test/blockwalker-import-browser.mjs` checks manual/programmed/legacy design
round trips, restored magnetic loads and cargo credit, corrupt inputs and failed
writes. Both checks accept a source tar path for compilation inside an existing
image. The import check optionally accepts an older world file as a third argument.
`test/blockwalker-driver-browser.mjs` verifies driving, the Eyes camera, a tilted
turntable and physical cargo delivery with save/reload and one-time credit. Pass
a source tar path to compile an edited source tree inside the existing image.
Its optional third argument selects a C fixture; use
`test/fixtures/blockwalker-competition.c` for repeated freight handoffs,
crowded-sensor recovery and reloads while carrying pallets.
`test/fixtures/blockwalker-traffic.c` replays a loaded barge pinned against a
patrol boat and requires physical escape and island delivery after a reload.
`test/blockwalker-spectator-browser.mjs` checks ride-along Eyes against actual
block poses while character programs continue, camera switching and leaving
the view with WASD. It also accepts a source tar for compilation in Dolly.
`test/blockwalker-session-browser.mjs` checks the visible browser save workflow,
real refresh restoration, modal input isolation and retention after storage failure.
`test/blockwalker-agent-browser.mjs` checks direct C calls, actual GPU PNGs,
exact trial timing, controller timeout containment, surviving creatures and
world restoration. Set `BLOCKWALKER_RELAY_CONFIG` to a private relay config path
to exercise real Astra inference instead. That optional run uses port 19199;
include `http://127.0.0.1:19199` in the relay's exact allowed origins.
On this Linux machine it can run under `xvfb-run -a` with the NVIDIA Vulkan
adapter, without opening a window on the desktop.
