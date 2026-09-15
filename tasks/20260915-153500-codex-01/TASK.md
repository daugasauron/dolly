# Tighten the biped patrol and reduce leg collisions

- STATUS: OPEN
- PRIORITY: 200
- TAGS: game,agent,physics

Verified Sidelight IV (Pi library#62, live#67) completed600s with41 physical
placements, six reversals and less than2cm stance drift. Preserve it unchanged.
Its root ranged from-1.964 to+2.076m despite +/-1.5m targets, and some sampled
opposite-leg impulses remained (peak1.1658Ns). Full evidence is in
build/blockwalker-patrol-clear-world/ and the previous patrol issue.

Actual Pi saved an earlier-turn variant as library#64/Patrol VI, same29-part
body and12 powered hinges. Its300s private trial stayed within[-1.469,1.443]m,
with20 placements, four reversals and no aborts. It is not world-verified.
Exact seed: build/blockwalker-patrol-library-64.json. Library#65/Patrol VII
starts backward; its complete300s comparison is the next resumed Pi task.

Independently check the tighter patrol for at least300s among the current world
population, with repeated reversals, real bilateral signed airborne placements,
ground-loaded support and bounded stance drift. The fresh catalog now contains
53 objects, including verified#62 at(55,-85) and III at(80,-85): choose and check
another clear spawn location before adapting the old test fixture. Avoid
mistaking library IDs for world IDs or spawning on a bundled creature.

Use actual Astra/xhigh and a few timed GPU observations to reduce opposite-leg
rubbing in separately saved body/controller experiments. Measure real pair
impulses and geometry, preserving gravity, collisions and ordinary joint forces.
No wheels, jets or external anchoring for walking support. Keep full native
history, all successful designs and all removal records. Promote/release only
independently measured successors; failed experiments remain in the library.

Prepared (not run): build/blockwalker-reserved-{browser,check,reopen}.mjs,
-analysis.py, -current-seed.json and -source.tar. The tar contains current53-entry
catalog plus temporary C contact diagnostics; SHA
62ca0bda465a8b9e1cfc35f4d5f7f34d14368e6e0fcbf8153d16def692b7f0cc.
This600s check spawns #64's exact body/controller at(30,-85), asserts initial
part clearance>4m and54 total objects, saves compact impulses/poses and three
GPU frames, and checks exact restoration. Analysis also requires root Z to
remain within +/-1.5m. Run one browser under4GiB/no swap and a780s timeout;
reports are preserved on failure. Inspect the fixture before running; do not
reuse the prior #62 test's now-occupied(55,-85) spawn.
