# Give the two-legged walker a reversible patrol gait

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,agent,physics

The verified bipeds walk forward indefinitely. The original has travelled over
120m; its straight path eventually reaches the edge of the central island.
Develop a separate controller that walks forward and backward between bounds,
using the actual Astra/xhigh Pi, physics sensors and a few timed GPU images.
Preserve every older body/program and the complete native conversation.

Reverse only from stable support, adapting signed foot targets and step checks
consistently. Use short patrol bounds to exercise multiple reversals within a
300s practice trial. Verify real alternating supported foot placements in both
directions, bounded stance slip, no falls and repeated direction changes. Then
verify at least300s among the existing world population in an empty starting
area. Keep gravity, collisions and joint limits. No wheels,jets or anchoring as
walking assistance. Save each experiment; release only a measured successful
copy, leaving old creatures and their eventual lifecycle records intact.

First real Pi prototype is library #59, Sidelight Patrol I, same body as #57,
13568-byte source. Its 300 s trial completed three reversals at68.117,169.317
and281.933 s; root Z range[-2.0195,2.2160] m. It scored12 forward and8 backward
placements, but the unfinished final backward attempt reached .30146 m root-foot
stance slip (.36187 m worst individual stance-block displacement). Upright at
the end, no physical failure; this is partial progress, not a release candidate.
Pi is capping individual swing reach after reversals before testing again.
Exact source/body:build/blockwalker-patrol-seed.json; result:
build/blockwalker-patrol-first-result.json. Patrol event rows include direction
at index3 and use the label "stable signed landing"; adapt physical analysis
accordingly rather than reusing the forward-only event layout unchanged.

Actual support-block geometry confirms Patrol I's late slip was planar
translation/yaw: six-block centroid moved .21980m and rotated -8.323 degrees
while all centers remained near y=.485. Evidence:
build/blockwalker-patrol-stance-slip.json. Reach-capped #60 still slipped
.2629m; slower-backward #61 reduced root-foot slip to .1551m but individual
support-block displacement remained .281m. Neither was released.

Pi's separate #62/Patrol IV turns fixed hip parts4/17 into powered yaw hinges;
the remaining part indices and six-block feet are unchanged. Its300s practice
trial scored12 forward and8 backward placements with three reversals and no
aborts. Maximum root-foot stance slip was .01811m, worst support-block
displacement .02010m. Root range[-1.74365,2.22679] overshoots the +/-1.5 targets.
Exact body/source: build/blockwalker-patrol-library-62.json; full returned
practice state/memory: build/blockwalker-patrol-yaw-practice-result.json.
Pi is comparing zero yaw commands on the same body before refining bounds.

An independent600s populated-world test of exact #62 completed in one browser
under4GiB/no swap, handle40793 (exit0). It adds a copy at(55,-85), separate from all52
catalog entries, records actual contact impulses/poses about every.1s and three
timed GPU frames, and checks exact world restoration. The verified results follow below.

The actual Pi comparison #63/Patrol V failed for posture at285.9667s
(tick17158), with4 aborted placements and3.535m maximum stance slip. Source
comparison confirms the exact same body and controller except a comment and
multiplying the hip-yaw command by zero. This supports active yaw feedback for
this gait; it does not establish general stability. Full result and source:
build/blockwalker-patrol-yaw-braking-result.json and -library-63.json.

The populated run passed600.05 simulated seconds (643.635 instrumented wall),
53 objects/1461 parts, zero removals and exact full-world restoration including
poses, velocities, source and controller memory. All52 earlier catalog entries
were unchanged. It made41 alternating physical placements and six reversals;
minimum sampled up=.985948, maximum controller stance slip=.018086m,
maximum independently measured support-centroid movement=.018311m. Every
placement had >.4125m signed airborne foot advance while the other foot carried
actual ground impulses. Root Z range[-1.9644,2.0762]m, netX=-.3560m.

There were767 supported airborne samples,630 with zero total impulse on the
swing foot. Some opposite-leg rubbing remains (peak1.1658Ns); no sampled
dynamic external impulses acted on any part. Sampling is about.1 simulation
seconds, not every tick. Evidence: build/blockwalker-patrol-clear-world/
contains proof.json, the contact/pose report, exact restored world, three
GPU frames and a30s actual-world video patrol-world.webm. Analysis is in
build/blockwalker-patrol-analysis.py.

Source catalog now includes exact verified #62 as Sidelight IV - patrolling
biped, at(55,-85);53 objects/1461 parts, with all52 older entries preserved.
Actual Pi checked clearance and released one unchanged copy as world#67
(seed6701), then restored its latest private experiment. The package and live
continuation checks below are complete.

Pi's #64/Patrol VI keeps the same body and active yaw feedback but triggers
stable reversals earlier. Its300s private run stayed within[-1.469,1.443]m,
with10 forward and10 backward placements, four reversals, no aborts and
.01811m maximum root-foot slip. It is saved separately; it has not passed a
populated-world test and does not replace verified #62.

The new image is built and verified:53 bundled objects/1461 parts, including
all older entries, Sidelight III/IV and the early failed-trial stopping change.
Fresh20s browser check matched all bundled controller sources and the exact
patrol body; no removals or model requests. Evidence:
build/blockwalker-patrol-packaged/proof.json; image build log and retry log.

The live session was migrated via normal chunked browser uploads and restored
as blockwalker-patrol. All workspace hashes and session compatibility matched.
Post-resume proof preserves all53 live objects/1390 parts, all65 older library
designs (now67 with the bundled aliases),14 removals, and the full374481137-byte
native history prefix; native history is now374504337bytes. Actual Astra/xhigh
requests resumed, and the834-character continuation prompt arrived intact.
Live#67 was upright at376.183s with25 scored placements, three reversals,
zero aborts and .018086m maximum stance slip. These runtime counters do not
replace the independent600s physical audit. Evidence:
build/blockwalker-walking/patrol-{image-restore,continuation}-proof.json.
Continue the separately tracked tighter-bound/contact work,20260915-153500-codex-01.
