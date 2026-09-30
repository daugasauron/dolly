# Tighten the biped patrol and reduce leg collisions

- STATUS: OPEN
- PRIORITY: 10
- TAGS: game,agent,physics

Verified Sidelight IV (Pi library#62, live#67) completed600s with41 physical
placements, six reversals and less than2cm stance drift. Preserve it unchanged.
Its root ranged from-1.964 to+2.076m despite +/-1.5m targets, and some sampled
opposite-leg impulses remained (peak1.1658Ns). Full evidence is in
build/slopyard-patrol-clear-world/ and the previous patrol issue.

Actual Pi saved an earlier-turn variant as library#64/Patrol VI, same29-part
body and12 powered hinges. Its300s private trial stayed within[-1.469,1.443]m,
with20 placements, four reversals and no aborts. It is not world-verified.
Exact seed: build/slopyard-patrol-library-64.json. Library#65/Patrol VII
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

Completed as handle95710 (600s,4GiB/no swap,780s timeout; browser exit0): build/slopyard-reserved-{browser,check,reopen}.mjs,
-analysis.py, -current-seed.json and -source.tar. The tar contains current53-entry
catalog plus temporary C contact diagnostics; SHA
62ca0bda465a8b9e1cfc35f4d5f7f34d14368e6e0fcbf8153d16def692b7f0cc.
This600s check spawns #64's exact body/controller at(30,-85), asserts initial
part clearance>4m and54 total objects, saves compact impulses/poses and three
GPU frames, and checks exact restoration. Analysis also requires root Z to
remain within +/-1.5m. Run one browser under4GiB/no swap and a780s timeout;
reports are preserved on failure. Inspect the fixture before running; do not
reuse the prior #62 test's now-occupied(55,-85) spawn.

The completed backward-first #65 practice comparison was weaker:18 scored
placements (11 forward/7 backward), two rejected backward placements, three
reversals and root range[-1.8996,1.5463]m. It stayed upright but reached .08881m
root-foot slip, .1225m individual support-block displacement and minup .9669.
Full result: build/slopyard-patrol-backward-first-result.json. No release.

The earlier #62 world report contains eight distinct positive sampled cross-leg
contact pairs, all inner foot boxes10/12/14 against23/25/27; no cross-leg hip or
knee pairs appeared. Peaks:14/27 at85.2167s (1.1658Ns),14/23 at286.05s
(1.1499Ns). Pair12/25 was most frequent. These are sampled observations, not
integrated contact totals. Exact pair records:
build/slopyard-patrol-clear-world/leg-contact-pairs.json.

Pi's separate Patrol VIII relocates inner toe/heel blocks12/14 and25/27
outboard, placing14/27 one block higher as ballast; total mass/part count stays
unchanged. The original rectangular-foot estimator would be invalid. Pi now
uses unchanged central pairs10/11,23/24 and outer toe/heel pairs13/15,26/28 to
derive the foot basis and filters contacts by actual height. It has installed
the new controller; no walking result yet. Both geometric findings were sent
through the normal Pi panel; all earlier designs remain saved.

The independent #64 run completed600.067s (644.727 instrumented wall),54 objects/
1490 parts,41 physical alternating placements, seven reversals and no aborts or
removals. Minimum sampled up=.985942; maximum support-centroid movement=.018335m.
Each placement had >.380m signed supported airborne advance; no sampled dynamic
external impulse acted on any part. All sources/bodies and exact saved poses,
velocities and memory reopened correctly. Some foot rubbing remains (peak1.3758Ns).

It FAILED the requested +/-1.5m root bound: range[-1.443726,1.630714]m. Maximum
excursion occurred at227.5167s during a backward swing (controller trace227.5,
phase2), after reversing at211.7s. The private bound pass did not generalize.
Do not promote it as a strict bounded success. Full report and false-status
proof.json are in build/slopyard-reserved-clear-world/, with
boundary-overshoot.json, restored world and three GPU images. The analysis
continues to assert the original bound after saving evidence; no threshold was
relaxed. Results were sent to actual Pi. No new release.

A diagnostic progress timer called visibleTerminalText while GPU mode was
active. That helper selects text using pointer events and toggled the Pi pane.
The world controllers step independently of that pane/agent toggle in game_frame;
no program, body or physical control was changed. The timer was removed for
future tests; the executed harness is preserved as
build/slopyard-reserved-browser-with-terminal-poll.mjs. Do not use that helper
as a passive logger during graphics. The owned test scope is inactive.

Pi saved VIII as library#68 and VIIIb (five-sole-block estimator) as#69.
VIIIb completed300s upright but scored only15 placements with6 rejected steps,
1.6133m root-foot displacement and1.4699m recorded foot-centroid drift; its
root range was[-2.0388,2.3272]m. Not an improvement. Exact sources/bodies:
build/slopyard-relieved-library-{68,69}.json; full returned practice result:
build/slopyard-relieved-practice-result.json. Keep both as experiments.
The next creative task adds arms to verified#62 (20260915-160000-codex-01),
preserving this unfinished bounds/contact work separately.
