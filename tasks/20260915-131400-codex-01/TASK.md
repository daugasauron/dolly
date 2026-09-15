# Give the biped cleaner foot clearance and a quicker stride

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,agent,physics

Sidelight II advances 7.208 m in 300 s with 18 alternating ground-clear
placements, but its opposite feet sometimes rub during swing. Actual Box3D
pair/impulse measurements are in build/blockwalker-contact/proof.json.
Keep that verified design and the original. Use actual Astra/xhigh Pi, real
physics feedback and a few timed GPU frames to improve foot separation and
weight-transfer speed. Save each experiment before replacing it.

Verify repeated forward placements with the other foot supporting the body,
clearance between opposite legs, bounded stance slip and at least 300 s in the
populated world before promoting another successor. Preserve gravity, collisions,
all creations and complete native history. Faster displacement from sliding or
falling does not count. Larger bodies and arm counterweights are possible
experiments, not requirements or hidden support.

Verified XLIV (live library #55) is now preserved in the source catalog as
Sidelight III - long-step biped, at (80,-85). All 51 earlier entries remain
unchanged. Its exact source and body passed 300 s in a 52-object/1432-part world:
18 alternating physical placements, 9.312 m forward versus Sidelight II's
7.208 m (+29.2%), no aborts or removals, and exact full-world reopen.
Sampled minimum up .987225; controller minimum .987206; maximum controller
stance slip .02071 m.

Every placement had observed supported clearance above .15 m and a sequence of
zero-contact-impulse samples with at least .49 m forward foot travel. These
contacts were sampled about every .1 s, not logged at every physics tick.
In a comparable first 90 s, opposite-leg impulses appeared in 9/91 supported
airborne samples versus Sidelight II's 76/135. Some rubbing remains; the maximum
observed opposite-leg impulse over the whole 300 s was .549 Ns. No external
impulse was observed during the supported airborne samples.

The first fixture mistakenly spawned directly on Sidelight II at (80,-50).
That entangled-body result is not gait evidence. The corrected test at (80,-85)
verified initial separation and used compact diagnostics plus bounded exports.
Both attempts remain under build/blockwalker-longreach-world* and
build/blockwalker-longreach-clear-world*. The corrected browser exited 0;
proof.json and contact-comparison.json contain the measurements.

Actual Pi released exactly one unchanged copy as #66 at (55,-85), seed6601.
At age134.63 s it had eight scored steps, 3.468 m forward travel and no aborts.
All 54 older creations and the full 362960038-byte native-history prefix remain;
build/blockwalker-walking/longreach-release-proof.json verifies this.
The live world has 55 objects/1448 parts. Packaging the new source catalog
and the practice-failure update remains part of the next world checkpoint.

Pi also saved #57's quicker transfer (10.250 m/300 s, 21 scored landings) and
#58's quicker foot separation (10.262 m/300 s, 20 landings, but only14 with
its contact-free-forward criterion). Neither replaces the verified source.
Continue the separate reversible-patrol task 20260915-141200-codex-01.
