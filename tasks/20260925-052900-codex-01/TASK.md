# Keep pistons valid when their child assembly joins an anchored base

- STATUS: CLOSED
- PRIORITY: 270
- TAGS: game,physics,bug

Importing the protected format-1 world (51 objects) into image 34 stops the
game at `prismatic_joint.c:310`, asserting `bodyB->setIndex == b3_awakeSet`.
Rigid neighboring blocks can merge a piston's child into the anchored root
while its parent remains movable. The upstream prismatic solver requires its
second body to be awake. This topology is valid and can be built normally;
do not detach neighbors, discard old characters or disable assertions.

Reproduce with opposing pistons lifting the same platform, one connected back
to the static root through neighboring blocks. Keep extension, retraction,
limits, feedback and save/restore correct when ordering the joint's bodies.
Then restore/advance the exact original save and the 125-object newer world in
both browsers. Preserve original files and controller programs.

Evidence: `build/slopyard-image34-preview-retry/failure.log`; original save
`build/slopyard-recovery-20260923/state/slopyard-world.json` remains intact.
The minimal C reproduction is `build/slopyard-static-piston/trial.c`.

The eight-block opposing-piston reproduction fails with the same assertion.
Ordering the dynamic endpoint second and reversing both local joint axes keeps
the public extension sign and limits unchanged. Both pistons extend 1.500600 m
and retract to -0.000645 m; maximum joint error is 0.000645 m. The original
51-object save then survives twenty reopens and ten simulated seconds, retaining
its sixteen previously recorded removals with no new deaths or program errors.
Evidence: `build/slopyard-compound-regressions-chrome-static-piston-
{baseline-valid,candidate-valid,original-restore}/`. The C reproduction is now
part of `test/fixtures/slopyard-bearings.c`. Packaged browser verification
remains before closing.

Verified in packaged image 35 in Chrome and Firefox: both the exact 51-object
original and the 125-object newer world import and continue, preserving every
ID/program and all historical removals, with no new browser/controller errors.
`build/slopyard-image35-preview{,-firefox}/proof.json`. Canonical bearing,
piston and winch tests pass in `build/slopyard-image35-canonical-proof/`.
The protected original save remains byte-identical. Source SHA-256:
`42a882d7abe466aec3ab476e012d64bbcced33cba1422a018f716571fabcc94c`.
