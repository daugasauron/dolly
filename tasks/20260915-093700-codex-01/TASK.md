# Measure joint stiffness in long articulated block chains

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,physics,performance

The unchanged Sidelight XXV biped stays upright, but scrapes its swinging foot.
At 16.117 s, reconstructing its stance chain from actual root pose and measured
joint angles under ideal rigid constraints misses the foot by 0.849 m. Actual
quaternion residuals include 2.91 degrees at hip-pitch joint 19, 2.29 degrees at
knee 20 and roughly 2 degrees at shoulder welds. Maximum linear separation is
only 0.00653 m. Evidence: `build/blockwalker-replant-trial/{geometry,proof}.json`
and `build/blockwalker-replant-{geometry,deflection}.py`.

The pinned Box3D source defaults all joint constraints to 60 Hz with damping
ratio 2. The solver caps frequency at one quarter of the substep frequency:
120 Hz at Dolly's existing 60 Hz/8-substep setting. Compare 60 versus 120 Hz
using the same blueprint/controller and an actual C build inside Dolly. Keep
all live physics and histories unchanged during this diagnostic.

Measure angular errors, actual foot clearance, gait transitions and cost.
Higher stiffness is not a walking result. Change game defaults only if the
comparison warrants it and the existing population, save/reload and core
physics checks still pass. Otherwise retain the measurement and existing
semantics; do not add a biped-only stabilizer or a new tuning feature flag.


## Result: retain the existing 60 Hz constraints

The temporary 120 Hz C build compiled inside Dolly and passed the native
physics checks. The unchanged XXV 32 s controller comparison reduced maximum
hinge angular residual from 2.935 to 0.841 degrees and maximum weld residual
from 2.130 to 0.732 degrees. Ideal stance-chain reconstruction error fell from
0.849 to 0.301 m. It removed the 0.383 s swing scrape, but increased landing
stance slip from 0.096 to 0.840 m. Both versions completed zero scored steps.
`build/blockwalker-constraint-trial/comparison.json` records the source hashes,
unchanged blueprint/controller and detailed measurements.

The subsequent paired 120 s whole-world replay retained all 49 objects in
both versions, but exposed a navigation regression. Longwake's unchanged
controller with normal constraints traversed 60.859 m of its route and reached
waypoint index 4, maximum sampled speed 1.103 m/s. At 120 Hz it stayed within
10.463 m of its start, reached only waypoint index 1 and peaked at 7.554 m/s
against its approximately 1.1 m/s target. Its measured body radius also grew
from a maximum 5.943 m to 6.551 m. Survival alone would have missed this failure.

The instrumented world loops took 153.347 and 154.303 wall seconds respectively.
They use the same wide camera and one-second state saves; these figures do not
isolate CPU/GPU cost. GPU counters are cumulative across launches in that browser,
so the raw frame totals must not be treated as independent frame rates.
`build/blockwalker-stiffness-world/` contains both traces, six GPU images and
`comparison.json`; `blockwalker-stiffness-world-final.log` records completion.

No game source, default physics or live state changed. Pi subsequently achieved
four alternating biped lifts/landings under the existing constraints in XXVIII;
its separate replay is tracked in the biped issue. The stiffness candidate is
rejected: measured angular rigidity improved, while existing behavior regressed.
