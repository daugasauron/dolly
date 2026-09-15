# Give the two-legged walker a reversible patrol gait

- STATUS: OPEN
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
