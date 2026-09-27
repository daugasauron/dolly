# Give scouts and recovery patrols reachable useful work

- STATUS: OPEN
- PRIORITY: 290
- TAGS: game,controllers,physics

Audit scouts, six cargo couriers, ground guards, rescuers and scrapyard collectors
against actual populated simulation. Preserve 20 Hz and ordinary physical controls.
Require real route progress, magnetic transfers, supported release and engine
island scoring; movement or a controller counter alone does not establish success.

Baseline: `build/overnight-20260928/team-audit/baseline-roles.json` compares
full-v5/full-v6. All six couriers perform useful jobs after the prior air-traffic
repair. Scout 11 has zero arrivals beside quarry rocks; guard 43 starts on the 14 m
mine roof and never reaches patrol. Old rescue patrols miss the active front.
Collectors find no eligible grounded enemies in those original timelines.
Per-role measured costs remain in `team-audit/profile-roles.json`; no population,
controller frequency, motor force or observation range was increased here.

The verified controllers make guards defer claimed targets; send Tsuru to the
forward combat area and feasible team-help calls; move a suspended rescue clear
of overhead geometry when actual winch travel cannot reach supported ground;
accept fresh own-side allied handoffs of neutral light cargo; and make Vesper's
existing hops report observed cargo/threats. Normal cargo searches still target
the combat zone, and observed team ammunition/noncargo is rejected on approach.

Verification, all compiled/run inside Dolly in one disposable browser:

- `team-audit/roles-v2`: unchanged scout at (38, .65, 48) enters combat after 57.333 s
  and reaches 4 patrol goals / 180 s. Guard 43 at (-36, .65, -46) enters after 24.4 s and
  stays on supported ground. These staging proposals await final layout integration.
- `team-audit/role-contact-v1`: the maintained
  `test/fixtures/blockwalker-role-chains.c` is included byte-for-byte and passes.
  Real help→response→claim→guard deference→pickup leads to magnetic release at
  139.517 s with 42.065 N external support, up 0.997454 and sole clearance −4.2 mm.
  Rescue completes at 143.517 s; the original porter resumes its controller.
  Original Suzu hauls a neutral quarry core, reports its completed handoff, and
  the normal East courier physically delivers it for an engine score at 230.217 s.
- `team-audit/gait-v1`: Vesper at proposed (-58, 3.65, -2) completes 4 physical
  hop/landing cycles / 90 s, minimum up 0.999987, with real sight and threat radio.
- `team-audit/followup-v2/collector-after.lua`: unchanged Kurogane continues the
  actual tether-produced 360 s save, preserving all 9 original poses/controllers.
  It claims/grips the grounded active enemy, carries it over 60 m, and releases it
  in the Red pit at 490.417 s. This is an exact historical-save proof; fresh tether
  comparisons use the corrected current courier and belong to the tether task.

Remaining: integrate and verify final terrain/catalog staging, including Vesper
and the scouts/guard. Preserve all current successful chains.

`team-audit/obsidian-v1` compares the unchanged Obsidian program and original
(76, 2.65, 68) start on terrains 8 and 9 for 180 s each. Terrain 8 reproduces
the roof obstruction at (76.48, 14.00, 68.00), with no completed landing. The
staged terrain 9 permits two complete cycles, with supported landings at
68.467 and 138.517 s: 98.445/96.645 N support against 76.665 N weight. Path
length is 170.943 m and minimum up is 1.0; no flight-source change is needed.
Sidelight/Hibari's isolated failure was motor chatter: delayed joint-rate
feedback drove the held motor-speed commands to alternate every 20 Hz tick.
Solving the same steady-state velocity target directly removes that feedback
delay without changing force, geometry, controller frequency or other filters.
In `team-audit/joint-v1`, ankle-pitch rate RMS falls from 1.1323 to 0.02286 rad/s;
59 successive command reversals fall to 2. Restoring the former 60 Hz filter time
constants alone did not fix walking, so that experiment was discarded.

`team-audit/endurance-v1` passes 600 s per canonical biped, using raw sole contact
forces, rotated foot corners, airborne advance, whole-stride stance slip and
stable supported landing. Sidelight makes 31 clean placements, 25 alternations,
11.780 m patrol range, minimum up 0.980994 and zero recoveries. Hibari makes 36,
33 alternations, 14.748 m range, minimum up 0.970635 and one successful recovery.
Five slipping Sidelight placements were excluded. The exact tested controller
is now canonical. `compatibility-v1` executes the exact maintained
`test/fixtures/blockwalker-biped.c`: both make 6/4 clean placements and 8
alternations in 180 s.
This does not establish general collision robustness or resolve the historical
late-fall scope in `20260915-110000-codex-01`.

`survey-rescue-v1` also proves the sparse biped scouting addition: an ordinary
courier initially outside observation range follows the walker's real report,
collects the freight and scores on its island at 239.267 s. The biped also reports
an active opposing surveyor, remains upright (minimum up 0.978813), and covers
4 m by 258.2 s. Current starts already cover central parcel sites: Sidelight to
(24, 28) is 42.426 m; Hibari to (-24, 38) is 42.953 m, within the 48 m sensor
range. No catalog relocation or added observation calls are required.
The actual post-rescue failure is resolved separately in
`20260927-232600-codex-supported-rescue-abort` (`7000f24`): a centered torso grip
produces a supported upright release, followed by independently verified walking
in the unchanged populated save.

`team-audit/surveyors-v2` proves the same sparse reporting for Marrowstep and
Sundial without locomotion changes. Both report neutral freight and active
opponents; a courier starting beyond its 48 m observation follows the actual
report, magnetically collects the freight and scores on the West island. Delivery
times are 211.167/368.667 s, minimum up is 0.994459/0.985554, and horizontal
axis spans are 28.404×19.391 / 21.409×68.189 m. The first private fixture
accidentally placed cargo in a flooded inlet; the corrected case asserts dry
ground rather than changing courier behavior. `surveyors-regression-v2` executes
the exact maintained `test/fixtures/blockwalker-biped-scout.c` against the latest
staged terrain 9 and sensor-argument optimization. All three missions pass, with
the original biped's prior delivery and upright walking retained. Marrowstep and
Sundial's exact source hashes are recorded in `surveyors-v2/comparison.json`.

`surveyors-canonical-v1` also passes the exact retained fixture on current
canonical terrain 8. The new scenarios capture the map's initial version rather
than hard-coding a future map; the older biped case stays on terrain 8. All
three physical dispatch/delivery missions pass without controller changes, with
the same 211.167/368.667 s surveyor delivery times as the staged terrain 9 proof.
