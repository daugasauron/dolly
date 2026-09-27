# Keep failed rescues attached until the patient is supported

- STATUS: OPEN
- PRIORITY: 310
- TAGS: game,controllers,physics

Actual `full-v6/after.lua` at 1200 s contains Hibari 39 suspended from Tsuru 85,
with its lift phase starting at 1192.267 s. The unchanged assisted controller
straightens the joints, but the patient hangs tilted from an off-center torso
grip and never reaches the rescuer's upright threshold.

`build/overnight-20260928/team-audit/survey-rescue-v1` replays all 163 actors,
changing only Hibari and Tsuru to their current verified sources; every other
saved field matches recursively. At 1282.333 s, Tsuru's unconditional 90 s
phase timeout disables the magnet. External support is zero and the feet are
4.64 m above ground. The biped falls from up 0.836 to -0.10 within 8 s.
The assisted state never completes. This is a commanded release, not a force
limit peel; inspect attachment geometry separately from the small motor chatter.

Acceptance: a timed-out physical rescue must keep its grip while lowering onto
actual external support. It must never count a failed setdown as a rescue.
Use observed shape/center-of-mass geometry for any regrip improvement and prove
the patient can settle and resume ordinary walking. Preserve the successful
porter rescue regression, actuator forces, body poses and normal physics.
