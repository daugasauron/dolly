# Diagnose the biped's late live falls

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,physics,agent

Original Sidelight world #62 was removed for posture at world time
35568.066666844425, age 1375.55 s (about 23 minutes). Last root position
(60.87023,1.55305,-15.10843), up=-0.452524. It had travelled about 34.89 m forward
from (60,-50). The removal log says Root tipped over; it does not establish the
underlying physical cause. No controller error was reported. The earlier
240 s populated and 300 s practice passes remain valid within those scopes.

The live world briefly had 52 objects after the fall; an unchanged replacement
restored the count to 53, with ten total removals. The original design and source
remain saved in its library; all earlier surviving objects remain. Do not
rewind the world or hide this removal. Keep full native Pi history and preserve
the successful original source while diagnosing robustness separately.

`build/blockwalker-walking/endurance-before-world.json` is the exact saved
53-object world at 35142.0333334243, 426.033 s before the fall. It was reloaded
after the app-only practice-ceiling update; world physics and controller source
were unchanged. Replay this saved state independently, capture actual foot,
contact and nearby-body evidence, and distinguish collision from controller or
initial-state sensitivity before claiming a cause. The removal record is in the
01:58:24 live mirror. Keep it as a durable diagnostic artifact before the rolling
mirror advances. A replacement may be released as a new ID with its history
explicit, while preserving the original saved design.


The unchanged saved-world replay reproduced the removal **exactly**: same world
time, age, position, up and cause record, after 426.0667 simulated / 693.129
instrumented wall seconds. Initial poses (including velocities), controller
memory, sources and random states matched for all 53 objects. Transfer timed
out at age 1327.967 s; recovery at 1339.983 s; it then fell in phase 9. Evidence:
`build/blockwalker-late-fall/proof.json`, dense poses/memory, nearest body records
and three timed GPU images. This was physical tipping, not a controller error.

Exact oriented-box separating-axis calculations find foreign walker #22's foot
(part 19) overlapping the biped's foot boxes before the failed transfer. Signed
gaps include -2.42 mm at replay elapsed 347.35 s and -13.89 mm at 368.567 s;
transfer timeout follows near 378.45 s. Contact impulses were not recorded, so
these geometric contacts alone do not establish the complete cause. Analysis:
`build/blockwalker-late-fall/contact-analysis.json` and its Python script.

A controlled comparison omitted **only #22** from the copied initial world,
retaining every other pose, velocity, source, memory and random state. It ran
for 600 simulation seconds via `build/blockwalker-no-pistonboot-browser.mjs`
under 4 GiB/no swap and a 1200 s timeout. Common samples and the later outcome were compared below. The live world is
unchanged. Its original was replaced as exact-source #63 with the #62 death
record retained (`build/blockwalker-walking/sidelight-replacement-proof.json`).


The comparison survived all 600 simulation seconds (988.398 instrumented wall
seconds), reaching biped age 1549.517 s. It made 34 further alternating physical
forward placements and travelled 12.7403 m, with minimum sampled up=0.991956,
no new aborts and no removals among its 52 objects. Rotated box corners verified
all 34 swings above 0.15 m clearance with the other foot near the flat ground,
forward foot advance above 0.15 m and upright landing. All other initial states
matched exactly; the live world was not changed.

There were 31 common exact simulation-tick samples: nine had byte-identical
poses/velocities and equal memory through elapsed 67.167 s. Matched pre-300 s
positions differed by at most 2.205 mm; divergence reached 0.447 m at 347.35 s,
where the original replay records overlapping foot boxes. This strongly
implicates the interaction with #22 in the late fall. It is not proof of general
collision robustness or a direct measurement of contact impulses. Diagnosis is
complete; controller improvements remain in the faster-biped issue.

Evidence: `build/blockwalker-no-pistonboot/` contains the full replay, three GPU
images, `proof.json`, `landings.json` and `common-tick-comparison.json`. Analysis:
`build/blockwalker-no-pistonboot-analysis.py`. Actual Pi received these findings
through a normal steering prompt while its separate XXXV trial continued.


## Second live fall and a clearer starting corridor

Reopened for unchanged replacement #63: posture removal at world time
38081.81666735654, age 1526.316667 s, root (64.55521,1.11669,-24.54125),
up=-0.158100. `build/blockwalker-walking/sidelight-second-late-fall.json` preserves
it. The first encounter diagnosis does not establish this second initiating
cause. No other object was removed or changed.

Actual Pi released exact original library design #43 as NEW #64, seed 4303,
at (85,-85). The main island is flat within +/-100 m; the forward corridor to
z=5 was over 17 m from other body centers horizontally at the checked snapshot.
The 03:16 UTC proof retained all 52 earlier surviving IDs/sources/blueprints,
53 objects/1390 parts, eleven removals, and the full 341,646,263-byte native
history prefix. #64 was upright at age 539.117 s, with 29 scored steps and about
10.78 m forward travel. Continue observing beyond the earlier fall ages before
claiming longer reliability. Proof: `sidelight-clear-corridor-proof.json` under
the walking folder. Do not rewind the population or erase either removal.

At the 03:59 UTC checkpoint, unchanged #64 reached 3278.567 simulated seconds
(54.6 minutes), 69.5323 m forward travel, 185 controller-scored placements,
up=0.999918 and only its original single initial unscored landing. All 53 objects
remain, with the same eleven removal records. This exceeds both earlier fall
ages in the clearer corridor, but does not establish collision robustness or
identify #63's initiating cause. The per-step geometry was not independently
rechecked for all 185 scored placements. Durable state and summary:
`build/blockwalker-walking/biped-checkpoint-before-world.json` and
`sidelight-long-corridor-proof.json`.
