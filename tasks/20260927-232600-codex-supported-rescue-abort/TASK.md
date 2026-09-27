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

Verified timeout-only change `team-audit/supported-rescue-v1` keeps the
magnet engaged and enters the existing lowering phase. The 180 s exact-world
replay prevents the airborne drop. Hibari reaches the ground but still has only
20.19 N external support against its 31.94 N weight; it correctly remains held,
with zero credited rescues. The existing 10 m lowering cap and 90 s phase reset
delay further cable payout. Unchanged-source continuation `supported-rescue-v2`
releases after another 66.783 s, on 34.208 N measured support, then leaves the
patient unheld with zero credited rescues. Both runs preserve every original
actor and report no controller faults. The biped remains tipped; this proves
safe abort, not successful orientation recovery. Canonical Tsuru now contains
only this verified change (SHA-256
`8fca6e436cf3458bd1ecccfa6c6abdf6db3b132c1afa91433b3b35ac6f496c21`).
The same candidate preserves the normal porter rescue: physical release at
139.517 s, 42.065 N support, up 0.997454 and ground gap -0.00416 m.

The suspended biped's attachment is 1.46–1.55 m laterally offset from its
whole-body center-of-mass axis. All ten joints settle near zero angle; late
ankle rates are about 0.0002 rad/s, with no sole self-contact. Do not change the
assisted motor controller without evidence of a separate failure.

Acceptance: a timed-out physical rescue must keep its grip while lowering onto
actual external support. It must never count a failed setdown as a rescue.
Use observed shape/center-of-mass geometry for any regrip improvement and prove
the patient can settle and resume ordinary walking. Preserve the successful
porter rescue regression, actuator forces, body poses and normal physics.
