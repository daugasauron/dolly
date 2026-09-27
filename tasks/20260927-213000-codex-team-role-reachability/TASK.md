# Give scouts and recovery patrols reachable useful work

- STATUS: OPEN
- PRIORITY: 290
- TAGS: game,controllers,physics

Audit scouts, six cargo couriers, ground guards, rescuers and scrapyard collectors
against actual populated simulation. Preserve20Hz and ordinary physical controls.
Require real route progress, magnetic transfers, supported release and engine
island scoring; movement or a controller counter alone does not establish success.

Baseline: `build/overnight-20260928/team-audit/baseline-roles.json` compares
full-v5/full-v6. All six couriers perform useful jobs after the prior air-traffic
repair. Scout11 has zero arrivals beside quarry rocks; guard43 starts on the14m
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

- `team-audit/roles-v2`: unchanged scout at(38,.65,48) enters combat after57.333s
  and reaches4patrol goals/180s. Guard43 at(-36,.65,-46) enters after24.4s and
  stays on supported ground. These staging proposals await final layout integration.
- `team-audit/role-contact-v1`: the maintained
  `test/fixtures/blockwalker-role-chains.c` is included byte-for-byte and passes.
  Real help→response→claim→guard deference→pickup leads to magnetic release at
  139.517s with42.065N external support, up0.997454 and sole clearance−4.2mm.
  Rescue completes143.517s; the original porter resumes its controller.
  Original Suzu hauls a neutral quarry core, reports its completed handoff, and
  the normal East courier physically delivers it for an engine score at230.217s.
- `team-audit/gait-v1`: Vesper at proposed(-58,3.65,-2) completes4physical
  hop/landing cycles/90s, minimum up0.999987, with real sight and threat radio.
- `team-audit/followup-v2/collector-after.lua`: unchanged Kurogane continues the
  actual tether-produced360s save, preserving all9 original poses/controllers.
  It claims/grips the grounded active enemy, carries it over60m, and releases it
  in the Red pit at490.417s. This is an exact historical-save proof; fresh tether
  comparisons use the corrected current courier and belong to the tether task.

Remaining: integrate and verify final terrain/catalog staging, including Vesper
and the scouts/guard. Recheck Obsidian after the roof relocation; its old left
thruster physically catches the roof edge. Preserve all current successful chains.
Sidelight/Hibari still fail on isolated flat ground: zero strict steps/240s and
first settling failures near19–20s. Traces show bouncing external contacts and
stance slip, with no sole self-contact. Their former60Hz filters retain per-tick
coefficients at20Hz, but restoring the time constants alone did not fix walking.
All gait variants remain ignored experiments; no production gait edit. Continue
physical first-landing diagnosis under `20260915-110000-codex-01`.
