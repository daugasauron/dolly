# Blockwalker

Build walkers, boats, flying machines and anchored structures from boxes and
magnetic-looking balls with powered hinges. The starter has five parts and four
joints; a three-part chain, an eight-joint quadruped and an empty grid are also available. There is no
automatic gait or balance system.

The C program uses the same raylib and Box3D libraries as the gamedev image.
Box3D runs fully 3D physics in Wasm on the CPU, with the existing serial,
non-SIMD build. A WGSL shader renders oriented boxes, matte joint balls, lighting
and shadows on WebGPU. A bounding-volume tree accelerates ray intersections. Raylib draws the editor panels in Wasm; those pixels
are uploaded when the controls change. Ordinary frames have no GPU readback; agent observations explicitly capture a cropped PNG.
This is a renderer for this box game, not a general GPU backend for raylib.

| Action | Control |
| --- | --- |
| Place a box or joint | Choose the part, then click a face or a side of a ball |
| Select / erase | Pick or Erase tool; V / X |
| Orbit / zoom / recenter | Camera buttons, right-drag or Alt + left-drag / scroll / H |
| Edit a joint | Pick it, choose X/Y/Z, click each key to rebind |
| Test / return to editor | Test character or Enter / Escape |
| Ground / water trial | Test surface button in the header |
| Anchor a structure | Select the starting block and toggle Root anchored |
| Density / appearance | Inspector Mass buttons / finish buttons beneath the palette |
| Undo | Undo button or Ctrl-Z |
| World / workshop | World button |
| Reuse a programmed design | Design library, then Open |
| Play a saved controller | Test character, then Play program; Stop program or backtick returns manual control |
| Pi panel | Pi button or Tab |
| Agent / player joint controls | Backtick key; taking control pauses Pi |
| Leave the editor | Escape, returning to Slop |

A regular block attaches rigidly to its parent. A joint block hinges at its
parent attachment and carries the attached branch with it. Two keys drive
opposite directions. Deleting a block removes its branch; Undo restores it.
Blueprint storage and GPU buffers grow with the design; there is no 64-part ceiling. Test mode leaves the build pose unchanged. Its camera follows root movement while
keeping the chosen offset, so a tall crane stays framed above its base.
The camera can orbit almost directly above or below the character. The floor
is hidden from below so you can attach parts underneath. Ball surfaces snap
attachments to the closest grid direction. Balls have spherical collision
shapes and use the same mass and assignable hinge controls as the boxes.
Boxes and balls weigh about 0.91 kg. Gravity is 4 m/s² and the character starts just above
the floor, giving time to try the controls. Hold a joint's keys to turn it;
release them to brake. Highlighted keys and joint angles show the response.

In the world, WASD moves the camera horizontally, Q/E lowers/raises it, and
Shift moves faster. Right-drag or Alt-drag orbits; scroll zooms; H returns home.
Click a creature's name to visit it. World and workshop cameras retain separate
positions when switching views. Typing a Pi prompt does not move the camera.
Pi's camera tool can also target explicit x/y/z coordinates.
The world sidebar jumps to the harbor, three islands or the whole map. Page
buttons or scrolling the creature list reach the full population; visiting a
larger creation fits the camera to its current physical bounds.

The part palette also has telescoping pistons, reversible thrusters, wheels and magnets.
Pistons move their attached branch along the selected axis and sign; the palette
starts them pointing outward, and the inspector can reverse that sign; their travel limit
is in metres. Thrusters apply force along their own rotating local axis and
coast when released. Their exhaust follows the actual thrust direction and
strength. Wheels have centered cylindrical collision shapes, a 0.7 m
radius, 0.7 m width and unlimited motor rotation. The larger radius keeps a
same-height chassis off the ground. Attach wheels as leaves: anything beyond them rotates too.
Each actuator uses a pair of assignable keys. The inspector shows speed, stroke
or force in the relevant units. Version 5 blueprints save magnets, anchoring,
materials and finishes. Versions 1–4 still load with their original mass and
appearance; old pistons retain their positive-axis motion. The agent JSON API
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
Finishes 0–3 select plain, panelled, glowing trim or hazard stripes without
changing the physics.

Pi receives horizontal distance, speed and torso orientation as well as timed
GPU images. Its goal is actual legged walking before exploring other moving
creatures; surviving in place or driving on wheels does not count as walking.

The design library keeps each released blueprint together with its controller,
anchor and materials. Releasing identical copies keeps one library entry; a
fallen creature remains available to reopen. Existing world saves populate the
library on first load. Library data lives in `blockwalker-world.json` alongside
the population, so exporting the world also preserves its designs.

A fresh image includes 13 examples learned by the actual Astra/xhigh Pi: walking
and wheeled creatures, feedback flyers, a catamaran, cranes and the opening
bridge. These are starting designs, not automatically spawned replacements.
Opening one restores both its body and program; water examples select sea trials.
Play program runs the controller continuously without starting Pi. Stop program
or backtick returns the joints to your keys. Pi can use `design_library` and
`open_design` to reuse and improve earlier work instead of reconstructing it.

The working blueprint is `/workspace/blockwalker.character`, reloaded when
the program restarts. Pi resumes its saved conversation as well as the world. Export downloads a copy; Import restores it into a fresh
image or browser session. Dolly's normal saved sessions also retain the file.

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

The model is `codex-local/gpt-6-astra`, xhigh effort, using the subscription
proxy. The Pi panel shows streaming traces and accepts messages with Enter;
a message steers a running turn. Pause aborts inference. Idle turns receive a
continuation prompt. Configuration and Pi sessions live under
`/workspace/blockwalker-agent`; credentials are never baked into the image.
Pi's main module is loaded before its SDK to avoid a QuickJS cyclic re-export
resolution failure; no upstream Pi source is changed.

After experimenting with the keys, Pi installs a JavaScript controller:

```js
function(t, sensors, memory, random) {
  if (memory.phase === undefined) memory.phase = random();
  return (t + memory.phase) % 1.2 < 0.6 ? "AW" : "QS";
}
```

Controllers default to 10 Hz; `program` can choose `hz: 20`, `30` or `60` for
feedback control. Existing saved programs retain 10 Hz. They run in separate
bare QuickJS contexts with no I/O or game API. A string holds keys at full
strength; an object such as `{A: 0.35, S: 0.6}` applies proportional output.
Opposite key strengths subtract. Values must be finite numbers from zero to one,
and every key must be assigned. Output scales motor target speed or thruster
force, within the part's configured limits. The C physics still runs at 60 Hz.

`program_trial` tests the installed program from a fresh practice drop, at its
chosen rate, with fresh memory and up to three timed GPU pictures. Simulation
pauses after the trial. The same controller implementation runs released creatures.

| Sensor | Meaning |
| --- | --- |
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
| `ground`, `waterHeight` | Terrain height and wave surface under the root; water height is available in sea trials and the shared world |
| `magnets` | Per-magnet `{power, attached, load}` by part index; power is 0–1, load is newtons |
| `submerged` | Per-part fraction in water, from 0 to 1 |

Vectors are three-element arrays. Initial body axes are +X right, +Y up, +Z
forward. For a two-wheel vehicle facing +Z with axles along X,
`Math.atan2(s.gravity[2], -s.gravity[1])` measures signed pitch and
`s.gyroscope[0]` gives pitch rate. Controller memory can hold an integral term;
there is no built-in stabilizer. A browser experiment with three vertical boxes
and two wheels recovered from a drive pulse using pitch, pitch rate and velocity
feedback; the same body with feedback disabled fell. The integration check also
runs a four-thruster PID platform, changes its target altitude, applies asymmetric
thrust, and verifies recovery and saved-world continuation.

Each controller has a seeded random function, 4 MiB memory and a 4 ms execution allowance. A failed controller
removes its creature without stopping the world. Shared Box3D physics allows
creatures to collide. After a three-second settling period, a sideways torso
(uprightness < 0.15) or collapsed raised torso (height < 0.65 m above land) is
removed if it stays fallen for two seconds. At sea, sinking more than three
metres below the surface also fails. Anchored structures and single loose blocks skip posture checks;
their controllers still have the same execution limit.

The world autosaves to `/workspace/blockwalker-world.json`, including blueprints,
programs, controller memory/seeds, ages, poses and velocities. Restarting the game
restores it. Export world downloads this file; Dolly saved sessions also retain
it. WebGPU renders the islands, moving water, stars, moon and thruster exhaust.

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
`test/blockwalker-agent-browser.mjs` checks direct C calls, actual GPU PNGs,
exact trial timing, controller timeout containment, surviving creatures and
world restoration. Set `BLOCKWALKER_RELAY_CONFIG` to a private relay config path
to exercise real Astra inference instead. That optional run uses port 19199;
include `http://127.0.0.1:19199` in the relay's exact allowed origins.
On this Linux machine it can run under `xvfb-run -a` with the NVIDIA Vulkan
adapter, without opening a window on the desktop.
