# Diagnose the original biped's late live fall

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

A controlled comparison now omits **only #22** from the copied initial world,
retaining every other pose, velocity, source, memory and random state. It runs
for up to 600 simulation seconds via `build/blockwalker-no-pistonboot-browser.mjs`
under 4 GiB/no swap and a 1200 s timeout. Compare common pre-contact samples with
the original replay and the later outcome before concluding. The live world is
unchanged. Its original was replaced as exact-source #63 with the #62 death
record retained (`build/blockwalker-walking/sidelight-replacement-proof.json`).
