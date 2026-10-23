# Slopyard: the slingshot catapults do not work as they should

- STATUS: OPEN
- PRIORITY: 170
- TAGS: game,combat,slopyard,0.1.4

Owner (2026-10-23): "create a task to fix the slingshot catapults in slopyard, search the
history in tatr theres a lot of user input there."

Done when: the owner's requirements from the history are listed here with their sources,
the slings and catapults load, aim and fire in the living world as he described, measured
with the audit (`audit.c`, `run.mjs` beside the living-world task) before and after, and
`demos/slopyard/test/slopyard-browser.mjs` passes on the GPU.

Owner (2026-10-23, later the same day): "For slopyard, the "3 block magnet thing with a line"
projectile never worked. Fix that. When it hits something in the air I want it to be able to
pull it down to the ground, I gave this input a while ago so see history for more details."
That is the Kusari tether round. Done when, in addition: a tether round fired by a slingshot
at an airborne machine hits it, holds on with its line, and brings it down to the ground,
measured in the living world (how often it hits, how often a hit ends on the ground) before
and after, with a screenshot of one capture.

## What the owner asked for, and what was built (September 2026)

The September task files hold the owner's words only as the agents paraphrased them;
each line below quotes the task file and names the version that holds it
(`git show COMMIT:tasks/ID/TASK.md`; most were removed on 2026-10-01 in `9a6d4445`).

1. The first catapult, `20260925-032000-codex-01` (`57644816`, the agent's brief from the
   owner's overnight goal in `20260924-211600-codex-01`): "Build a team-colored industrial
   throwing machine whose editable program aims at opposing aircraft and throws ordinary
   light cargo. A separate machine must physically reload it. Use ordinary motors, magnets
   and contact physics: no actor-specific C steering, launch impulse, guaranteed hit or
   cargo teleport." Built: the Tengu slinger and Koban feeder crews (image 28).
2. Same task, `56f29b70`: "The user's subsequent live report found unstable bearings and
   repeated loader collisions." `20260925-080000-codex-01`: "The user reports unstable
   slingers and frequent collisions with their loaders. [...] Rebuild both crews around 3x3
   bearings, separate their working space [...] Keep loading, aiming and clearance
   decisions in editable character programs." Built (`56f29b70`): broad turntables, two
   3x3 bearings per Tengu, Koban shuttles 16 m away that "withdraw before the throwing arm
   approaches"; 360 s with three reloads and shots, "no dropped loads or crew collisions".
3. `20260925-083000-codex-01`: "The new slingers work, but each starts with only three
   crates. Add compact recovery trucks that gather loose, unscored light cargo and return
   it to their team's loading bay." Built: the Tonbi recovery trucks (`108b25d3`).
4. `20260925-221800-codex-01` (`9a6d4445`): "The user likes the physical catapults; air
   retrieval is too easy [...] Add physical defenses and reload interactions using editable
   character programs, ordinary actuators and real cargo; no hidden forces, actor-specific
   engine behavior or guaranteed hits." Built: the Hosen channel battery, its shuttle and
   tender (image 39); `20260926-005230-codex-01` refined its aim, `20260926-044300-codex-01`
   tried to make hits break cargo grips (never shown).
5. `20260927-081800-codex-projectile-tethers` (`018c5f27`): "The user intended a magnetic
   projectile fired by an existing slingshot, with a rope that ground vehicles can grasp
   and pull to drag down an enemy aircraft. The overnight hovering tower is the wrong
   interaction and reportedly caught a friendly aircraft." Built (`d7dbeb45`, `4961bf0c`):
   the four-part Kusari tether round and Kanagu cable tugs; left open: "reliable
   rotated-round reload and repeated interception". The task's own brief at `d7dbeb45`:
   "physically attach its magnet to an enemy, let a ground machine acquire/pull the trailing
   end, and show the aircraft being restrained or pulled down. No hidden forces, target-ID
   exceptions, teleports or weakened enemies." Its closing note (`9a6d4445`): the lifecycle
   fixture passes; "Reuse of a returned round was never established".
6. `20260927-133500-codex-combat-map`: "The user requested distinct bases and a central
   combat/drop zone [...] put team machinery on its own side, launch compact independent
   ammunition". `20260927-145000-codex-base-zones`: "slingshots stood in the combat area
   [...] Artillery and loading apparatus stay inside the bases". Built: terrain 7, then
   terrain 8 with eight guns at x = ±52, four per team (`d82ff391`): ground Tengu and
   Hosen, an air-supplied roof sling and a car/hoist-supplied roof battery.
7. `20260927-211000-codex-overnight-showcase` (`2e7d93da`): "Additional user requirements:
   rename the game to Slopyard; move every slingshot closer to the middle while keeping it
   within its team's territory; give every station both ground and air resupply.
   Investigate reusing a roaming boat to recover stray projectiles. Prefer shared
   suppliers and existing hulls over increasing population." Its brief also: "a launched
   magnetic round catches an aircraft but its handle stays on the aircraft [...] Give the
   ordinary nonmagnetic artillery rounds useful physical consequences." Then: "The user
   ended expansion early: 'finish the in progress work but do not start new work.'"
   `20260927-215800-codex-artillery-resupply` restates it: "Each of the eight slingshots
   should sit closer to the central combat zone while remaining in its own territory. Each
   needs two independent physical ammunition paths: ground transport and air transport.
   [...] Avoid a separate fleet per gun." Built: only the gate that waits for the bearing
   to settle before the arm winds up (`fb2147e6`) and a cheaper trajectory check. The
   forward guns (x = ±40 on a terrain 9), shared suppliers, raised guns and salvage boats
   stayed private and their evidence is gone.

## Reproduce

`sling-audit.c` beside this file runs the fresh catalog like the living-world audit and
prints, per gun, seconds in each phase, loads, shots, misloads, rounds dropped while
spinning, the longest time a round was held unfired, and contact with its own loader and
other friendly machines; each shot, and what each round touches in the 10 s after it:

    DISPLAY=:N node tasks/20261001-223000-slopyard-living-world/run.mjs OUT \
      tasks/20261023-160002-slopyard-catapults/sling-audit.c 2400

`build/slopyard-evidence/` (not committed) holds every run below: `audit-*` and `sling-*` on
the GPU display (`run.mjs` with `DISPLAY=:152`, under the shared GPU lock), the shorter
probes with a headless copy of `run.mjs` (SwiftShader page, the same Wasm simulation).

## Before: the fresh catalog at `e936ac95`, 2,400 s

The living-world audit: 36 deliveries (East 21, West 22 points), 178 actors, no removals or
controller errors, the same totals as on 2026-10-02. The sling audit of the same run:

| Gun | Shots | Loads | Held a round unfired | Enemy aircraft in sight | Only excluded by the gun's floor |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tengu / Red (52, -24) | 3 | 4 | 697 s | 215 s | 0 s |
| Tengu / Blue (-52, -24) | 3 | 5 | 823 s | 348 s | 0 s |
| Hosen / Red (52, 24) | 5 | 5 | 463 s | 322 s | 0 s |
| Hosen / Blue (-52, 24) | 0 | 1 | 2,040 s | 0 s | 0 s |
| Hayate roof sling / Red (52, 16.5, -72) | 1 | 2 | 1,972 s | 19 s | 144 s |
| Hayate roof sling / Blue (-52, 16.5, -72) | 3 | 4 | 1,312 s | 55 s | 508 s |
| Yagura roof battery / Red (52, 16.5, 72) | 0 | 1 | 2,367 s | 6 s | 10 s |
| Yagura roof battery / Blue (-52, 16.5, 72) | 0 | 1 | 2,367 s | 0 s | 0 s |

- 15 shots; three rounds touched an enemy aircraft (two of them the target). Neither Kusari
  tether round was ever fired.
- Two rounds flew off the arm while spinning (both Tengus, 74 s and 82 s). The Red roof
  sling misloaded twice (46 s, 70 s): its loader left the round at (55.2, 16.5, -74.9),
  2.9 m off the dock and out of its own reach.
- Every unfired wait is "Watching combat zone": no enemy in range. A gun only targets enemy
  machines in the combat zone (|x| <= 32) within its 48 m sight, so at x = ±52 it sees the
  zone's edge. A roof gun also requires its target to fly 5 m above the gun's own floor,
  the 16 m roof: the roof slings saw qualifying aircraft for 19 s and 55 s, and aircraft
  excluded only by that rule for 144 s and 508 s.
- The Tsuru rescuers bump into the roof slings (25 s at up to 599 N, 5 s at 675 N).

## What changed (`demos/slopyard/src`)

- Every gun station moves toward the middle, inside its team's territory: the ground
  batteries from x = ±52 to ±44 with their loaders, magazines, Kusari round, recovery truck
  (whose bays are fixed relative to its start) and cable tug as one group; the Red roof
  stations to x = 47 (the front edge of the Red decks, x 44..72) and the Blue roof stations
  to x = -40. Blue's stations were translated copies of Red's, with the loader on the side
  toward the middle; they are now mirror images (blueprints mirrored across x), loader
  behind the gun. The Red roof decks reach no further forward; moving them is a terrain
  version of its own and was not done.
- The Koban loader works in either facing (`koban-east-loading-shuttle.lua`), and the roof
  supply flight and hoist find the magazine bay on the gun's side of a mirrored loader.
- A gun's arm clearance follows the arm's actual sweep: a teammate is in the way when the
  loaded head, swinging in its vertical plane, passes through it at its nearest distance,
  instead of any teammate within 7.4 m at any height overlapping the arm.
- Airborne means 5 m above the terrain under the target, not above the gun's own floor.
- The Hayabusa ammunition flight supplies every loader it sees from its start, the one with
  the most empty bays first, instead of only the nearest (its roof sling's): each ground
  Tengu battery now has air supply besides its recovery truck. In 600 s the Blue Tengu
  waited 240 s for ammunition instead of 463 s, with enemy aircraft in sight for 378 s.

Rejected on the way: turning Blue's stations half a turn instead of mirroring them. A
turntable's angle is about its axis regardless of its mounting direction, so the turned
arm loads upside down (13 misloads in 600 s, pole 11 m above the round). Ground batteries
at x = ±40 or ±46 without their trucks and tugs: the trucks' bays stay where they were and
the tugs park in the arm's sweep or push against the gun (134 s at 413 N).

## After: the fresh catalog at `4987c4a6`, 2,400 s

On the GPU display (`audit-gpu-final`, `sling-gpu-final`) and headless (`audit-final`): the
two audits print the same lines, so the simulation does not depend on the display and the
shorter probes since were run headless.

| Gun | Shots before | Shots after | Held a round unfired, after | Enemy aircraft in sight, after |
| --- | ---: | ---: | ---: | ---: |
| Tengu / Red (44, -24) | 3 | 4 | 1,599 s | 286 s |
| Tengu / Blue (-44, -24) | 3 | 6 | 92 s | 1,458 s |
| Hosen / Red (44, 24) | 5 | 3 | 426 s | 135 s |
| Hosen / Blue (-44, 24) | 0 | 0 | 1,479 s | 25 s |
| Hayate roof sling / Red (47, 16.5, -72) | 1 | 2 | 1,359 s | 66 s |
| Hayate roof sling / Blue (-40, 16.5, -72) | 3 | 7 | 65 s | 93 s, and 1,661 s below the old floor rule |
| Yagura roof battery / Red (47, 16.5, 72) | 0 | 0 | 2,367 s | 0 s |
| Yagura roof battery / Blue (-40, 16.5, 72) | 0 | 2 | 254 s | 41 s |

- 24 shots instead of 15; five rounds touched their target (before: two), one touched a
  teammate (6 N). No misloads; one round flew off a spinning arm per Tengu side at most.
  Loader contact at most 6.6 s per gun (before: 36 s at the Red Tengu).
- The guns that still hold rounds see no enemy: the Red Yagura battery none in 2,400 s, the
  Blue Hosen 25 s. Blue's aircraft rarely come to Red's northern flank, and Red's to Blue's
  Hosen. The Red decks end at x = 44: the Red roof guns sit 7 m further back than Blue's.
- Deliveries fell to 25 (East 8, West 24): from 520 s the three Red couriers stacked over
  the East island goal. One had lowered its core onto the courier departing below it, which
  then hovered 0.2 m short of cruise height in 'depart' for good while the other two waited
  above it. `6075f560` lets a departing courier leave after 10 s; the same fresh world then
  scores East 13, West 17 by 1,200 s, as before the stations moved.

## The tether round (Kusari)

The four-part round: a root block, two magnets either side of it and a winch block on a
line. Fired at an airborne enemy, a magnet that touches it holds on, the line pays out until
the winch block (the handle) lies on the ground, and the team's Kanagu cable tug is to grip
the handle and haul the machine down; the round lets go once the machine stands on the
ground (`m.releases`) or after 180 s (`m.aborts`). The sling audit prints each round's
phases, captures, grounded and aloft releases, and how low the held machine came.

- Before (`e936ac95`, 2,400 s): neither round was ever fired; no capture.
- After the catapult work (`9faf2c17`, 2,400 s): both fired (72 s, 89 s); the Red one caught
  the Kurogane West scrap collector at 20 m at 77 s and laid its handle on the ground. The
  Red tug followed the round's radio report but sat behind the shed at (15, -20) for 120 s
  while the collector dragged the handle 40 m around it; the round let go aloft at 257 s.
- In the next runs both rounds flew off the arm while it spun (83 s, 166 s). The guns held
  them 1.4 to 2.1 m from the root, by an outer magnet, and the winch block, beside the root
  on the side of the gun, sat 3 cm from the gun's rotor: the round touched the gun (17 to
  153 N) just before each drop.

Changes (`f14c9351`): the round stands on its winch block, under the root (a single block
below the arm's path instead of one toward the gun); a gun grips a round only by its root
block and lowers its pedestal for a round with a part below it; a tug that stays within 3 m
for 10 s short of a distant goal first drives to the clear point 12 m away nearest the goal;
a haul gets its own 180 s; the tug accepts a standing round within 2 m of its bay
(`slopyard-tether-lifecycle.c` failed at 1.1 m with the standing round, and passes).

A replay of the `9faf2c17` capture (its world saved at 82 s, only the programs replaced):
the tug drives round the shed, grips the handle at 222 s and hauls; the collector is held
down at 16.7 m over the shed roof (its lowest part at 14.6 m, the roof at 14.1 m).

In the living world (fresh catalog, 2,400 s, headless):

| Sources | Tether shots | Hits (captures) | Brought to the ground | Let go aloft | Dropped from the arm |
| --- | ---: | ---: | ---: | ---: | ---: |
| `e936ac95` (before) | 0 | 0 | 0 | 0 | 0 |
| `9faf2c17` (stations moved) | 2 | 1 | 0 | 1 | 0 |
| `f14c9351` + `6075f560` | 1 | 0 | 0 | 0 | 1 |
| `c962100e` without the plane clearance (`sling-t2`) | 2 | 2 | 1 | 1 | 1 |
| `c962100e` (`sling-t3`) | 0 | 0 | 0 | 0 | 5 |

- `sling-t2`: the Blue Tengu's round caught the Kurogane East collector at 571 s, the Blue tug
  gripped the handle at 592 s and hauled; the collector came down from 18 m to 3.4 m and the
  round let go of it standing on the ground at 701 s. The Red round caught Kurogane West at
  394 s; no Red tug reached it and it let go aloft at 574 s, the collector's bottom at 13 m.
- A screenshot of a capture (`shot/out-gpu/capture-1.png`, GPU display): the replayed
  Kurogane East held by Blue's round 4.6 m above the ground, the Blue tug behind it hauling.
- What still fails: the round flies off a spinning arm. Its winch block hangs on a 1 m line
  and swings out a metre beyond the round as the arm turns; at the bottom of the turn it
  strikes the gun's base (gun part 0, up to 204 N) or tears the round off without a contact.
  Standing the round on its winch block moved the strike from the rotor to the base.

Why the round flies off, measured and worked out: the winch line is a distance joint of at
least 1 m, so the winch block can stand a metre from the root in any direction, and a fast
turn holds it radially outward. At the bottom of the turn the root is 6.45 m from the arm's
pivot (8.5 m up) and the winch block's underside 7.9 m: 0.55 m above the ground, under the
top of the gun's base (0.97 m) where the swing passes over it. In the dock direction that is
the pedestal; aiming toward the middle (90° from the dock) the swing passes 1.5 cm beside the
base's arm. A single box reaches 1.55 m and clears both.

Rejected (`sling-t4`, 2,400 s): hold a long round at the bottom and throw it on the first
upswing, accelerating at 8 rad/s², letting it down again past three quarters of a turn. No
round dropped, but no tether round was thrown either (the Blue Tengu held its round 1,978 s,
spinning 10 s in all): one upswing never met the 1.15 m prediction. Deliveries 44 (East 23,
West 28).

Tried next (`sling-t5`, 2,400 s, not committed): `raise-tengu.mjs` beside this file lifts
both Tengus' bearing, mast and arm a block on a 3x3 spacer over the base and the pedestal a
block on a support box, the Koban takes the dock height from the gun's pedestal at rest,
and the supply flight leaves tether rounds to the ground batteries. No round flew off an
arm and the Red Tengu threw 9 boxes, but no tether round was thrown: the standing rounds
were knocked off their places in the stock row (found 4 to 7 m from it) and the Blue
Tengu misloaded a box that lay beside the raised pedestal. 34 deliveries.

### 2026-10-24: launched, held and brought down

Each step measured headless on the fresh catalog for 900 s with the sling audit, and with three
probes in the evidence (`stock/stock-watch.c`: who moves a tether round that nobody holds;
`haul.c`: the line, its pull, the magnets' load and the held machine's height; `touch.c`: what
a machine is in contact with).

- The stock. With the raised Tengus (`t5`) the standing rounds were pushed out of the stock row
  by the Koban loader within 23 s: its head grips a box by the face away from the gun, 1.06 m
  beyond the box's centre, and the round stood 2 m from the box, so the head came down on it.
  Lying rounds (`t6`) were pushed the same way, and the head then landed on the winch block;
  spacing the two rounds 2.5 m apart (`t7`) still had the lifted round swing into the other.
  Now one tether round per ground battery, as before the catapult work, at the far end of the
  row (x = ±55, ammunition at ±50 and ±52.5), where nothing lies beyond it in the head's path:
  both rounds are loaded at 27 s (`t8`).
- Flying off. On the raised Tengus no round struck the base; one tore off without a contact
  (`t7`): the arm's magnet (100 N) holds the round by its root while the winch block swings
  out on its line. A round of several parts now spins with a margin of 0.5 under the magnet's
  hold instead of 0.8 (`tengu-east-cargo-slinger.lua`). No round has flown off since.
- The haul. The winch reeled in with at most 15 N: its speed servo reckoned with the two light
  bodies it joins, not with what pulls on them, and the collector pulled up with 40 N on the
  round's magnet, so the line shortened only when the machine dipped (`t8`: from 14.5 m to
  9.6 m in 180 s). A winch now reels in with Box3D's distance-joint motor at its speed and with
  up to its force (`character.c`), keeping what it took in. At the full 100 N and 6 m/s the Red
  round tore off its collector (`t9`); the round's winch force is now 60 N, under its magnets'
  100 N, and it hauls at a third of its speed (`t10`: down from 14.5 m to 2.0 m in 15 s).
- Held down. With the handle in the tug's fork and the line all in, the machine's underside
  comes no lower than about 2 m, so the old test (resting on the ground) was never met. The
  round counts it brought down when the tug has the handle, the line is in and the underside is
  within 3.5 m of the ground, holds it there 20 s and lets go; a machine that rests on the
  ground is let go after 2 s, as before.
- The tug. Its fork turned toward a handle the machine dragged and never settled within
  0.08 rad: it takes it within 0.4 rad after 8 s and drives up again after 20 s. A fork that
  comes no closer to the handle in 15 s backs off and tries again: the Blue tug sat on an air
  parcel against the Red tug for the rest of the haul (`t10` to `t12`). It takes a round whose
  line is folded to 2.5 m: the motor folds the line against the fork at 2.19 m, which left the
  tug waiting for 2 m (`slopyard-tether-lifecycle.c` failed with the motor, passes).
- Rejected (`t11`): counting slow machines among a tug's obstacles. The Blue tug circled its
  handle beside the Red tug instead.

| 900 s, fresh catalog | Tether shots | Hits | Brought down | Let go aloft | Off the arm | Shots, all guns | Deliveries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `c962100e` (`sling-t3`) | 0 | 0 | 0 | 0 | 2 | 9 | 17 |
| one round per battery, gentler spin (`t8`) | 2 | 2 | 0 | 2 | 0 | 15 | 16 |
| the winch motor at 100 N (`t9`) | 2 | 2 | 1 | 0, one torn off | 0 | 12 | 19 |
| the haul at 60 N (`t10`) | 2 | 2 | 0, Red held at 2.0 m | 2 | 0 | 17 | 17 |
| held down counts, the tug backs off (`t13`) | 2 | 2 | 2 | 0 | 0 | 20 | 17 |

In `t13` the Red round held Kurogane West down at 2.9 m and let go at 174 s; the Blue round
brought Kurogane East onto the ground (its underside at -0.3 m) at 217 s.

These sources (`t13` and the tug's 2.5 m fold) are the commit after `a2b8fb60`. Their 17 fixtures
pass headless, and `slopyard-browser.mjs` passes on the GPU display (Chromium, `:152`). A
screenshot of a capture on the GPU display, the world saved at 214 s (evidence
`shot/out-final/capture-1.png`): the Blue tug's fork holds the handle, and Kurogane East sits on
the ground under the Blue round.

The final sources (`c962100e`, pinned `94960664`) were measured in `sling-t3`/`audit-t3`
(headless, 2,400 s): 45 deliveries (East 25, West 27), 23 shots, every gun fired at least
once, four rounds touched their target, none a teammate, no removals or controller errors.
`demos/slopyard/test/slopyard-browser.mjs` passes on the GPU display (Chromium, `:152`) at
`4987c4a6` and again at `94960664`: its 17 fixtures and the driven car.
