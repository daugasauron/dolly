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
   rotated-round reload and repeated interception".
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
