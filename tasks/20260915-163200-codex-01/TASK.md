# Expose support and self-collision forces to character controllers

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,physics,agent

The arm trials exposed a useful missing distinction: `touching` reports any
contact, including speculative and self contacts. Actual hand/hip collisions
required a separate diagnostic build to identify. Give controllers per-part
upward normal force from outside their own character (`supportForce`) and
summed normal force from their own blocks (`selfContactForce`), both in newtons.
Use the final 1/480 s solver substep from the last fixed 1/60 s physics tick;
controller frequency must not change the units. Earlier transient contacts may
read zero. Exclude friction, joints, magnets and buoyancy from these collision-only
readings. Preserve `touching`.

Verify free fall, settled weight, self collision and another dynamic body's
contact using actual Box3D in the browser. Check that feedback controllers see
the values and measure overhead in the populated world before packaging.
Keep this internal to the C game; no Dolly ABI or browser authority changes.

The first settled-weight check rejected converting `totalNormalImpulse` to
newtons. Upstream accumulates that diagnostic during both solve and relaxation;
it is not the net physical impulse integrated over the tick. Use final-substep
`normalImpulse / (1/480 s)` for the force estimate. Older diagnostic reports
retain the raw solver accumulator: its zero/nonzero collision classification
remains useful, but its numerical sum must not be treated as net momentum change.

Verified in C compiled inside Dolly, then again in the packaged image:
free fall reads zero; a3.650692 N block reads3.650690 N at10 Hz and3.650683 N
at60 Hz. An anchored arm pressing its own blocks reports30.09657 N self force
and zero outside support. A separate dynamic crate supports the cantilever's
root with1.52918 N; total beam support14.60275 N matches its14.60277 N weight.
These checks are part of `src/slopyard/check.mjs`.

At identical physics state, seven batches of50 complete sensor passes over
53 characters/1461 blocks had median cost .8139 ms before and .9346 ms after:
.1207 ms extra per full pass. This is a sensor microbenchmark, not total FPS;
even reading every character at60 Hz adds .7242% of a16.667 ms frame budget.
The two builds produced byte-identical1159561-byte saved worlds, including
all poses and controller memory. Evidence:
`build/slopyard-sensors-benchmark-matched/` and
`build/slopyard-forces-packaged/`.

The image build reused dependencies and took20.7 s; snapshot231956389 bytes,
SHAd43f7c3247c94951db7295ec558255feb9108cf1e142a4110b9bd9efeb08b3a3.
Fresh packaged checks preserved53 objects, all bundled sources, the exact
29-part biped and zero removals/model requests. Build80400, focused test10704,
matched benchmark72984 and packaged check61037 are terminal0; no test browser
remains. The earlier helper upload failed on an existing destination and was
fixed to upload into/tmp before copying; this was not a product failure.

Live migration to `slopyard-forces` verified every archived workspace hash,
new packaged C/agent/catalog sources and session compatibility. It retained
all53 live creations,76 designs and the entire384715559-byte native history.
Restore75530 and verifier87245 are terminal0. The previous `slopyard-patrol`
session and its image remain available; nothing was pushed or deployed.
