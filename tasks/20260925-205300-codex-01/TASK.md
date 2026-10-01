# Keep friendly rescue traffic clear of a loaded slingshot

- STATUS: CLOSED
- PRIORITY: 30
- TAGS: game,content,bug

In the unbundled checkpoint-combined trial, West slingshot 87 remains in load
from 957.7 through 1500 simulated seconds, holding parcel 91 on its powered
magnet. Loader 88 has released the parcel and is idle. The slingshot fires three
times, missing the existing four-shot quota; its mechanics remain intact.

The final saved pose places friendly guard 73 inside the swing-clearance check:
guard radius 4.823 m, root distance 9.812 m, available clearance 4.989 m against
the program's required 7.395 m. The guard is approaching teammate 71 for a rescue.
This is an observed reason to hold fire, not missing ammunition. Reproduce from
`build/slopyard-compound-regressions-chrome-checkpoint-combined/`
`salvage/slopyard-world.json`; sources and all machine blueprints are preserved.

Investigate generic coordination or path planning that moves friendly traffic
out of the sweep and lets the loaded gun resume. Preserve captures, rescues and
the safety check; do not move actors by hand or weaken collision protection.
Verify the same loaded parcel is subsequently fired, with no crew collisions.
The served image remains the earlier stable checkpoint; this trial is unbundled.

Further saved-state inspection: guard73 is fully inverted (up−1.000000), not
merely standing in the way. Its program sets all wheel commands and lift to zero
below up0.2, so route yielding alone cannot recover this state. Teammate71 is also
fallen (up0.117727) but farther from the gun. `build/slopyard-guard-recovery/`
contains an unrun matched120s replay and a generic program candidate: extend the
existing hydraulic forks while overturned, then resume patrol after stabilizing
upright. No added forces, moved actors or changed opponents. Require physical
recovery, at least10s upright, the same loaded round91 fired, no friendly hits and
no actor losses/errors. Test input remains the exact1500s combined save.

The matched120s `guard-righting` replay fails: baseline final up−1.000000;
existing fork rams lift the candidate to−0.708646, but neither becomes upright
or lets the loaded gun fire. Rear wheels reach the ground while the vehicle
leans on its extended forks. Both retain all actors, with no friendly hits or
controller errors. Evidence:
`build/slopyard-compound-regressions-chrome-guard-righting/salvage/`.

A second paired60s `guard-traction` replay starts from that tilted1560s save.
Positive/negative wheel drive moves73 clear and gun87 fires91, but final up is
−0.710745/−0.758045 with zero upright time. No friendly hits, missing actors,
errors or deaths. Firing alone is not successful rescue; neither variant is
promoted. Evidence: `build/slopyard-compound-regressions-chrome-guard-traction/salvage/`.
Its progress filenames end1560, but their embedded simulation time is1590.

An untested heavier teammate rescue-dozer prototype is retained under
`build/slopyard-rescue-dozer/`. Its added ballast currently uses finish2
(glow); change to finish3 (stripe) before testing. No prototype is bundled.
Preserve captures and physical teammate rescue. Image40 remains the checkpoint.

The physical rescue-dozer trial runs300s from the same1500s populated save,
adding one33-part,67.088kg teammate at(60,−28); all originals remain. It grips
both fallen teammates and rights71, which ends with90.40 consecutive seconds
upright after release. It cannot right73 or let gun87 fire91.122 final objects,
no errors/deaths/missing originals/friendly impacts; dozer minimum up0.84836,
final1.0. Evidence: `build/slopyard-compound-regressions-chrome-rescue-dozer/salvage/`.
This is partial physical rescue evidence, not a completed traffic fix.

Trace shows73 is grabbed by only one100N magnet on wheel20 (body mass2.131kg),
then the hydraulic lift loses it. A new program candidate in
`build/slopyard-rescue-dozer/grip-catalog.json` requires enough attached magnet
force for the target's weight before lifting, approaches its center of mass more
slowly once gripped, and ramps the existing hydraulic extension. Same blueprint
and opponents, no engine changes. This variant is prepared, not yet verified.

The grip/slow-lift variant also fails the heavy rescue at1800s:121 objects,
71 upright for73.45s after release,73 never attached, gun91 not fired, no errors,
losses or friendly impacts. Dozer minimum up improves to0.98439; final1.0.
Evidence: `build/slopyard-compound-regressions-chrome-rescue-grip/salvage/`.
It repeatedly approaches73 then changes its job to opponent72 and retreats.
The program adopts the first magnet's owner even during a teammate rescue;
incidental grips can replace the intended target.

`target-grip-catalog.json` retains the selected rescue target and releases each
magnet that catches someone else. `target-replay.c` is prepared for a matched120s
old/new program replay from that trial's progress-dozer-1680.json. Change only
existing dozer118's program; require actual73 grip followed by10s upright after
release, and the same loaded91 fired without friendly impacts. Preserve all
actors and the opponents' controllers. This next test has not run yet.

Target-preserving replay completes1680→1800s in both branches, raw1 (wrapper5
from Xvfb cleanup). Both retain121 actors with no errors, deaths, missing originals
or friendly impacts; guard73 remains inverted and gun87 does not fire91.
Candidate does make physical progress: its fifth lift starts at1797.117s, and all
three magnets hold73 at the final frame (parts20,18,20; loads19.94/100/100N).
It no longer adopts opponent72 as its rescue target. The short test ends only
2.88s into that lift; this is not yet a verified failed lifting maneuver.

Evidence: `build/slopyard-compound-regressions-chrome-rescue-target/salvage/`
contains both worlds and1740s progress saves. Candidate final pose is
(70.998,0.698,−17.683), guard(75.672,1.486,−10.945). Baseline has no73 attachment.
Prepared, not run: `build/slopyard-rescue-dozer/held-continuation.c`,60s from
guard-candidate.json with the unchanged target-grip program. It records the
dozer's ram angles, magnet loads and controller state every second, and still
requires physical righting plus91 fired without actor losses or friendly hits.
Measure the lift before changing actuator strength or the vehicle design.

The unchanged held continuation now completes1800→1860s, raw failure1. Guard73
remains inverted (sampled up−1.000000 to−0.997176);91 is not fired.122 objects,
no missing originals, controller errors, deaths or friendly impacts. During the
first lift, the base100N piston stays near zero extension and the upper one near
0.61m. A second lift reaches0.96m at the upper piston but again fails to tilt73.
The42.45kg guard weighs about170N in this world's gravity; serial pistons do not
add lifting force. All three magnetic grips alone are insufficient.
Evidence: `build/slopyard-compound-regressions-chrome-rescue-held/salvage/`.

Prepared mechanical alternative: three parallel100N pistons drive one rigid
magnetic crossbar. The first37-part prototype interferes with its front wheels
and drives away from the rescue; its trial is still running. A41-part variant
moves the existing wheels outward on ordinary box mounts, clearing that beam.
`parallel-wide-catalog.json` uses the unchanged target-grip program, wheel torque,
magnet forces and original opponents. It has not run; no prototype is bundled.

Both parallel-piston variants now complete their300s trials. The narrow version
rescues neither teammate; sampled wheel/beam self-contact reaches21kN and it
overturns. The wide version records zero sampled self-contact, rights71 for278.11s
after release, retains122 actors and stays upright (minimum0.978), with no errors,
deaths, missing originals or friendly impacts.73 still only tilts to up−0.9308;
the two grips are both on its wheel20 while all three pistons extend together.
Gun87 still holds91. Evidence: `...-chrome-rescue-parallel{,-wide}/salvage/`.

Next unrun variant:47-part rotary recovery truck, `rotary-catalog.json`/`rotary.js`.
The same three parallel pistons raise a3×3 rotating head with five100N magnets.
It requires a grip on a substantial body as well as enough total holding force,
turns the attached teammate upright, then lowers it before releasing.700Nm bearing
and all other configured forces are within existing part limits; no engine change.

Rotary variant completes300s, raw failure1:122 objects, no sampled self-contact,
errors/deaths/missing originals/friendly projectile impacts. Minimum wrecker up
0.98364. It turns71 upright, lowers/releases it and records141.93s upright time.
It never begins a lift on73: opposing guard72 obstructs the direct approach.
Accidental grips are released without changing the rescue target, but the truck
keeps pushing into that traffic.73 stays inverted and91 remains unfired.
Evidence: `...-chrome-rescue-rotary/salvage/`.

Matched1620→1800 replay now runs `rotary-route-replay.c`/`rotary-route-catalog.json`.
Only118's program changes: choose a clear detour around an intervening machine,
turn magnets off during the detour, then resume the same physical rescue. It uses
body width for the travel corridor and full turning clearance at the waypoint.
Recorded1620s sensors choose(63.759,−4.815) around72; this static decision is not
movement proof. Await `...-chrome-rescue-rotary-route/salvage/` before promotion.

The matched route replay completes with both branches still failing:122 actors,
no errors/deaths/missing originals/friendly impacts,73 inverted and91 unfired.
The candidate does release the wrong grips and drive toward detours, but fails
to reach them before replanning; it later also routes around the loaded gun.
At1800s it is upright at(70.64,−4.73), versus the earlier blocked approach. Nobody
holds it magnetically in the1680/1800 saves. This does not establish a successful
heavy rescue or ammunition release. Keep the prototype unbundled.

Shape-query routing comparison completes1620→1800s in both branches, raw1.
The heavy guard73 stays inverted (final up−1), gun87 does not fire91, and neither
branch loses actors or reports errors/deaths/friendly projectile contacts. The
candidate retreats away when no clear root-body approach is found; this does not satisfy
the heavy-guard rescue gate. Full trace and final worlds:
`...-chrome-rescue-rotary-shapes/salvage/`. All rescue prototypes remain unbundled.

September 27 populated Lua checkpoint still leaves heavy rescue open.
`build/living-world-20260926/long-fresh` preserves all actors for 7,200 s but guards
43/44/46 end overturned. Guard 44 is upright while holding aircraft 31 around
390–395 s, then approaches fallen teammate 49: up .841 at 405 s, .565 at 415 s,
and inverted by 430 s. Do not attribute this roll to carrying the aircraft
without further contact evidence. Guard 45 remains upright and approaches 43.
The shared program's other successful settled rescues do not satisfy this
issue's heavy-vehicle and gun-clearance criteria; no speculative anti-roll fix
was added to the packaged image.

## Closed (2026-10-01)

Superseded. The case (guard 73 inverted inside gun 87's swing clearance) came
from a September world that is gone, and both candidates failed. In a fresh
2,400 s audit of the current catalog (`20261001-223000-slopyard-living-world`) the loaded guns that never fired
were watching an empty sector: both Yagura roof batteries and the Blue Hosen held
a round for 2,366 s reporting "Watching combat zone", and the Red roof sling
stayed in "hold". Gun placement is one of the gaps listed in `20261001-223000-slopyard-living-world`.
