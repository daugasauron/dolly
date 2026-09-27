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
and the scouts/guard. Recheck Obsidian after the roof relocation; its old left
thruster physically catches the roof edge. Preserve all current successful chains.
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
is now canonical; shorter maintained coverage is `blockwalker-biped.c`.
This does not establish general collision robustness or resolve the historical
late-fall scope in `20260915-110000-codex-01`.
