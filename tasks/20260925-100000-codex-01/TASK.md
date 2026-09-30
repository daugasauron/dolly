# Represent fixed block assemblies as rigid physics bodies

- STATUS: CLOSED
- PRIORITY: 230
- TAGS: game,physics,performance

Every block previously owned a Box3D body, including fixed neighbors. Welds
made long assemblies flex and consumed solver time. The crowded Firefox
profile attributed about 7 ms per tick to Box3D. Completion required real
compound bodies, unchanged shapes/materials, correct block-local forces and
sensors, preservation of older saves, and browser/gameplay/performance checks.

Image 33 constructs one body per fixed component, retaining moving bodies
across hinges, wheels, turntables and pistons. It keeps all collision shapes,
density/friction and stationary broad-bearing plates. Block-local frames drive
thrusters, magnets, water displacement and shape-specific contacts. Mass,
contacts and destruction visit each shared body once. Articulated assemblies
retain self-collision except between the original parent/actuator shapes.

World format 4 stores block-origin velocities and block-local magnetic anchors.
Versions 1–3 preserve their saved poses, including old weld strain, and combine
linear/angular momentum. Opening a legacy session first writes an original-JSON
backup. Repeated reloads initially multiplied quaternion roundoff until Box3D
rejected a joint frame. Normalize restored/relative rotations and give each
body owner an identity frame. The exact failed 97-object save now survives
twenty reopen cycles and ten simulated seconds; a bearing fixture also repeats
twenty reopens. The saved failure and rejected baseline are preserved in
`build/slopyard-compound/repeated-restore-failure.json` and
`build/slopyard-compound-regressions-chrome-restore-baseline/`; passing
results are in `...-restore-normalized/` and `...-bearings-normalized/`.

Verified results:

- Chrome and Firefox mechanics restore the 125-object, 2327-block legacy world
  as 383 bodies. Maximum initial position error is 0.000002861 m; reopened
  error is 0.000010491 m. Programs, memory, IDs and blueprints are unchanged;
  six magnetic attachments preserve contact points within 0.000000084 m.
  `build/slopyard-compound-{chrome,firefox}-mechanics/`.
- Every bearing size (1x1 through 4x4) and axis, reversed 3x3 mounts,
  stationary-side controls, momentum, off-center thrust, buoyancy and
  shape-specific support pass. A driven arm physically stops against its own
  chassis: 312.45 N contact, -0.730 rad angle, 0.002785 m separation.
- Paired Firefox CPU replays take 26.288/26.274 s before and 19.282/19.144 s
  after over 1800 ticks, about 27% less time. Same-browser rendered A/B/A gives
  29.77 / 52.15 / 30.77 warm FPS. All 125 objects remain without errors.
  `build/slopyard-compound-{paired,render}-firefox-simd/`.
- The fresh 2400 s populated trial retains 127 objects, records 35 deliveries
  and six complete heavy freight chains, and stores two heavy loads per team.
  No controller errors, crew contacts or truck rollovers. The 600 s isolated
  slinger trial also passes loaded reload, manual interruption and three
  recovery/loader/slinger handoffs. Evidence: `build/slopyard-rivalry-
  compound-freight-populated42/` and `build/slopyard-launcher-compound-interrupted/`.
- The full canonical pilot/lifecycle/playground regressions pass. Northline and
  Harbor use ordinary support feedback and boom control where old programs
  relied on weld sag. Fixtures now attribute support by shape and use a hinged
  wrong-grip obstruction, since fixed anchored assemblies are actually static.
  `build/slopyard-image32-driver.log`, `build/slopyard-driver/cargo-physics.log`.
- Packaged image 33 passes Chrome/Firefox fresh-catalog and old-world restoration
  (all 93 designs/125 saved objects), plus program editing, invalid import,
  changed keyboard binding and repeated restart. `build/slopyard-image33-
  preview{,-firefox}/` and `build/slopyard-image33-driver/`.
- The final 127-object world grows to 129 retained objects while Firefox renders
  at 48.15 warm FPS, near real time, with no errors. All twelve other images
  and six protected files (392379755 bytes) remain unchanged. `build/slopyard-
  rivalry-view-firefox-crowded-image33-freight/` and `build/slopyard-image33-preservation.json`.

Final source archive SHA-256:
`107a7af7418dac72c2ceafb4bf557cf5f50991b725a6db850495183f70925e03`.
West's unsuccessful ammo patrol is tracked separately in `20260925-083000`;
late warehouse routing remains in `20260924-220500`. Their cargo remains
physical. No cadence, observation-cache, default-sleep or content-removal
experiment was included in this change.
