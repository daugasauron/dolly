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
`fine-aim.c` was prepared to replay the same attached-round save with the original
and candidate program for90s each. Input `external-gun.json`
from the above trial, candidate `fine-aim-catalog.json`.

The shot save at1574.233s also shows a directional restriction: the projectile is
at y18.638 with upward velocity2.548m/s; the courier root is at y17.208, roughly11m
away horizontally. The current release gate requires upward velocity>2m/s even
when a descending shot could intercept an airborne target. `slinger-intercept.js`
and `intercept-catalog.json` remove that restriction, retaining predicted miss,
positive flight time, motion toward the target and the existing crew-clearance
gate. This candidate is used in the matched replays below.

Verify actual hostile contacts, controller budget, firing delay and friendly
clearance in the matched replay and a populated run before promotion. A hit is
not evidence of a shootdown; measure the aircraft's physical response separately.

First matched trial `...-chrome-battery-intercept/salvage/` returns raw0, but its
predicate is inadequate:347 hostile final-substep contacts belong to ground
guard72, not target59. An early user-facing aircraft-hit claim was corrected.
Do not use this pass as aircraft-hit proof. Cargo velocity changes sharply near
the courier before those later contacts; the final-substep normal impulse can
miss a brief earlier collision. `fine-aim-events.c` instead enables Box3D hit
events on the round and reads buffered `b3World_GetContactEvents`, whose upstream
solver requires a positive total normal impulse. It counts only the intended
target before the projectile reaches the ground.

Buffered replay passes: `...-chrome-battery-intercept-events/salvage/intercept-proof.json`.
Original program:0 intended hits. Candidate:2 impacts on courier59 at1568.583s
and1568.733s, approach speeds11.092/8.171m/s, no friendly airborne impacts.
Minimum courier up is0.977654 versus0.994555; it remains flying. The candidate
later returns rather than continuing pickup, but the whole cargo scene differs,
so do not attribute that decision solely to the hit. No missing actors/errors.
Enabling hit events leaves both complete final worlds exactly identical to their
uninstrumented versions. This verifies the observation without changing physics.
Fresh multi-shot verification is still required before promotion.

Fresh multi-shot verification now passes within `battery-freight-apron`: all
three starting rounds hit their intended aircraft. Shots110→9 at77.767s,
109→59 at149.050s,108→9 at218.283s; first impacts at79.050/151.350/219.550s,
approach speeds12.113/13.947/12.371m/s. Buffered events record13 total intended
impacts across those three rounds and zero friendly airborne impacts. The1800s
run retains all131 actors with no deaths/controller errors. Its overall raw1 is
the missing freight/resupply quotas, not an aiming pass for the whole world.

The verified program is now in canonical catalog entry106. Packaging remains
pending; the served image39 still has the old program. This establishes repeated
hits, not shootdowns or balanced air retrieval. A separate mass comparison is
prepared in `build/blockwalker-dense-ammunition/`: same force-limited program and
attached-round save, with round101 changed from alloy to existing ballast. It
has not run. The prototype derives its mass limit from magnet strength/gravity
and retains the light-cargo ceiling; no engine forces or opponent changes.
