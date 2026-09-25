# Improve slinger accuracy against cargo aircraft

- STATUS: OPEN
- PRIORITY: 240
- TAGS: game,controllers,combat

In `build/blockwalker-compound-regressions-chrome-battery-external-round/salvage/`,
the first resupplied shot101 targets courier59 at1574.217s. Predicted miss is
1.871m; measured nearest root distance is2.374m, with no hostile or friendly
projectile contacts. Supply works, but this shot does not impede air retrieval.

The editable slinger program samples flight time at0.1s intervals and releases
within min(2.5m,0.95×target radius). Candidate `slinger-fine-aim.js` under
`build/blockwalker-battery-supply/` refines the best interval at0.01s and requires
a1.15m miss. No engine forces, opponent changes or guaranteed collision.
`fine-aim.c` is prepared to replay the same attached-round save with the original
and candidate program for90s each; it is not yet run. Input `external-gun.json`
from the above trial, candidate `fine-aim-catalog.json`.

The shot save at1574.233s also shows a directional restriction: the projectile is
at y18.638 with upward velocity2.548m/s; the courier root is at y17.208, roughly11m
away horizontally. The current release gate requires upward velocity>2m/s even
when a descending shot could intercept an airborne target. `slinger-intercept.js`
and `intercept-catalog.json` remove that restriction, retaining predicted miss,
positive flight time, motion toward the target and the existing crew-clearance
gate. Use this candidate in the prepared matched replay; it remains untested.

Verify actual hostile contacts, controller budget, firing delay and friendly
clearance in the matched replay and a populated run before promotion. A hit is
not evidence of a shootdown; measure the aircraft's physical response separately.
