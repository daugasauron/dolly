# Stop failed practice runs when the world would remove the creature

- STATUS: OPEN
- PRIORITY: 200
- TAGS: game,agent,iteration

XXXV collapsed by its 123.383 s settle timeout but its requested 300 s practice
continued to the end, spending almost three more minutes on a fallen body.
The end displacement included falling and was unsuitable as walking progress.

Use the same sustained physical-failure criteria as world removal to finish
program_trial early, retaining the cause, actual steps, final GPU image and
controller memory. Keep brief recoverable disturbances and successful full
trials, cancellation, and existing input bounds working. Avoid separate drifting
copies of the world rules or hidden balance help. Verify an actual falling
creature, an upright completed trial and recovery inside the permitted grace
period in Dolly; preserve boats, anchored mechanisms and current world/history.
Do not shorten successful checks merely to make the tests pass.

The existing world rule is in world_step: after 180 initial ticks, accumulate
fallen time while nonfinite, below terrain/water, up<0.15 for a multi-part body,
or a formerly raised torso collapses below ground+0.65 m. Remove after >2 s;
anchored bodies skip ordinary posture/depth checks. Controller errors are
separate and immediate. Trial physics currently checks only controller failure,
and its caller frees the controller on failure, losing inspection memory.
Extract the physical classification for shared use and retain a stopped trial's
memory/result. Keep the failure reason separate from cancellation, which also
sets remaining=0. No production change has been made for this issue yet.
