# Make Blockwalker a drivable, social cargo playground

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,physics,controls

Work through 2026-09-24 18:00 JST on the user-requested playground. Preserve the
retro reconciliation and learned-world recovery on their existing checkpoint
branches. Current work: `codex/blockwalker-playground-20260923`.

Completion requires:

- An Eyes block supplies an actual body-relative first-person view when entering
  a character in the shared world, with a way to return to the builder/viewer.
- A simple, easily controlled car is the fresh starting character. Driving uses
  physical motors, works with other world objects, and has clear controls.
- A Turntable block rotates attached assemblies continuously. A tilted mounting
  must work physically and visibly, with editable controls and saved designs.
- A meaningful cargo statistic and gameplay loop, with physical pickup/transport
  and delivery, visible feedback, persistent attribution and no repeated credit
  for the same cargo.
- Characters sense and interact with one another, choose varied destinations
  and move around substantially more. Demonstrate actual behavior, including
  safe handling of nearby actors/obstacles, rather than just random parameters
  on the same repeating path. Preserve demanding walkers as walkers.
- Remove the useless bridge from the starting population; add varied characters
  and activity throughout the world, as requested on September 24. Measure the
  resulting population's performance and interactions.

Keep the game in C and compile it inside Dolly. Browser verification uses one
4 GiB/no-swap disposable browser at a time. Preserve the user's learned world
and complete native Pi history. Lua/YAML migration is the separate
[requested task](../20260923-211500-codex-01/TASK.md).

Current source checkpoint: `8b34788`, served at
`http://127.0.0.1:9099/blockwalker/`. Image 17: 232306971 bytes, SHA-256
`525859b01b59aa20c6171f8ee5b2cf2dfc7c26632e525dab220afdd88ee3ef9e`.
Source tar SHA-256:
`9c7886b146fc90fb86c18bd0faa26e8016d350b8df3608e0bd3db5fa16ddd38c`.
The unchanged-runtime rebuild took 24.4 s
(`build/blockwalker-playground-image17.log`). Image 16 is preserved under
`build/blockwalker-image16-preserved/`; earlier branches and recovery archives
remain unchanged.

The fresh world has 60 objects / 1604 parts / 41 library designs: 44 characters
and 16 original cargo objects, plus bounded replenished supplies. New worlds use
the industrial map and island competition; saved worlds retain their map version.
Tidegate and eighteen earlier prototypes remain optional archive entries.
The starter is a nine-part magnetic car; WASD drives physical wheel motors,
E/Q powers/releases its magnet, and Backslash switches Eyes/follow. All 44
characters have Eyes; following one keeps its program running. Eyes (6) and
Turntable (7) preserve earlier block IDs; blueprint v6 reads versions 1–5.

Five small lookouts roam the yard and islands and turn their physical heads
at other characters. Three small skiffs fill coastal routes. Walkers yield or
replant around traffic while retaining physical walking. Boats and aircraft
choose varied destinations using terrain and nearby bodies. Mochi lifts cargo
with a piston and delivers it to the Works yard. Tsubame tows floating crates
to Harbor Atlas, which lifts them into the Harbor depot. Brinehook raises
submerged cargo onto its tray; Kawasemi collects it and flies to the Island
depot while the gantry collects another crate. Beacons track nearby machinery.

Cargo credit requires physical transport from outside the depot, release and
one second of slow supported settling; each crate scores once. Carrier and
player totals persist across restarts and replacing the player's character.
The HUD shows powered/loaded magnets and delivery confirmation. Delivered
crates remain physical, so controllers must avoid them and account for stacks.

Verification of the earlier 51-object checkpoint follows. Current 60-object
competition evidence, freight reloads, physics/controller checks and actual
preview measurements are recorded in the
[competition task](../20260924-074500-codex-01/TASK.md).

Earlier verification:

- `build/blockwalker-dock-population-cargo-42.log` passed 1200 simulation seconds
  and six separate process/world reloads: all 51 alive, zero removals and ten
  deliveries. The dock courier made both gantry handoffs. Marrowstep made 1498
  independently measured supported airborne foot placements, including 385 in
  the last five minutes; minimum up 0.99285. Traces and saved worlds:
  `build/blockwalker-dock-population-cargo-42/`.
- The same 51-object package also passed 1200 s with route seed 7 and six
  reloads: no removals, ten deliveries, and both dock handoffs. Sidelight's
  controller reported 74 qualifying steps and zero aborts; these are its
  diagnostics, not a separate foot-contact audit. Evidence:
  `build/blockwalker-dock-population-varied-7/` and its matching log (exit 0).
- The current packaged driving/physics suite passed in
  `build/blockwalker-dock-driver.log`: 11.9455 m driven with real keys, 73
  body-relative Eyes samples, real pickup, repeated courier deliveries,
  restart while loaded, persistent attribution and no duplicate credit.
  The tilted turntable has a 0.785 rad mounting, 23.910 rad rotation and maximum
  joint separation 0.00376 m. The fixture also covers overflight clearance,
  water beneath piers, cargo avoidance and the recovered walking gait.
- Actual 9099 preview check `build/blockwalker-dock-preview.log` passed catalog
  comparison, loaded courier follow/Eyes, 6.443 m continued movement and no
  browser errors. Its five-second local sample measured 36.58 FPS on NVIDIA
  Blackwell; this is not a cross-device performance claim. Screenshots and
  exported worlds are in `build/blockwalker-dock-preview/`.
- Real manual play in `build/blockwalker-cargo-ui-packaged.log` used C/E/W/Q to
  spawn, pick up, drive and deliver a crate once. Reacquiring it added no score.
  The porter also completed its remaining jobs with the player's car parked
  near the depot (`build/blockwalker-porter-occupied-baseline.log`).
- Sidelight's most recent independent long gait/contact audit used the earlier
  45-object population: 1800 s, nine reloads, 117 qualifying steps, zero aborts
  and zero external biped contacts. Evidence:
  `build/blockwalker-air-traffic-long-42/`. Current population traces prove it
  remains upright and moves; they do not independently count its foot contacts.
- Editor, embedded controllers, exact world restore and bounded script failure
  were verified in `build/blockwalker-playground-editor1.log` and subsequent
  packaged integration logs. Library/design/world exchange, proxy replacement,
  durable-save UI and first-tick sensor restoration have their own closed
  issues `20260923-203200-codex-01` through `-05`.

Physical failures found during combined trials are fixed and recorded separately:
[tilted gantry pickup](../20260924-030000-codex-01/TASK.md),
[buoyancy beneath piers](../20260924-035500-codex-01/TASK.md),
[quarry clearance](../20260924-051500-codex-01/TASK.md),
[stalled walker lift](../20260924-054500-codex-01/TASK.md),
[dock handoffs](../20260924-062500-codex-01/TASK.md), and
[lookout cargo collisions](../20260924-065600-codex-01/TASK.md).

The user's next content direction is a two-island industrial cargo competition;
follow [the prototype task](../20260924-074500-codex-01/TASK.md) through the same
requested deadline. The [large-session memory issue](../20260923-200000-codex-01/TASK.md)
is open: the complete 387804845-byte native history now survives normal Save
and close/reopen, with independently checked restored-file hashes and 3.08 GiB
peak. Immediate same-tab refresh still exceeds 4 GiB. Ordinary-size Save/refresh,
modal typing/F11, held-key release and failed-save retention pass in
`build/blockwalker-session-memory-final.log`. The original named saves and
recovery archive remain untouched.
