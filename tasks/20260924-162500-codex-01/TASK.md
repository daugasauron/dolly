# Keep Marrowstep walking after traffic rotates it

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,game,physics

The uninterrupted default-seed 5400 s population retains all 60 original objects
and completes 68 deliveries, but Marrowstep stalls in replant for 916.8 s and
later drifts to (-68.46,83.30), far from its home (-75,35). Its final 140 s have
no supported airborne foot placements. Survival alone is not a walking pass.
Evidence: `build/blockwalker-continuous-population-fresh0-90m/summary.json`
and its full corner/contact and controller traces.

Loading the final physical save reproduces the stationary replant. Three feet
support it, all hip/knee angles are near zero, up is 0.99996, but the remaining
foot is about 3 cm above the floor. Requiring all four simultaneous contacts
makes replant permanent. Its fixed home-line heading also fails after rotation.
Sensors and actual contacts: `build/blockwalker-marrow-probe-final/`.

Keep its articulated body and physical gait. Verify recovery from the saved
state, real airborne/support steps, terrain-aware movement near home and
continued walking with the complete population. No hidden forces or teleports.

The saved 5400 s state now runs for another 600 s with all 60 originals alive.
Marrowstep returns to (-87.28,37.42), 12.52 m from home, through its joint motors.
Independent corner/contact analysis counts 749 airborne/support placements,
183 in the last quarter, minimum up 0.99512 and no phase interval above 2.3 s.
Its pre-existing 159 replant counter does not increase. The fix accepts a
straight, upright three-foot stance for recovery and chooses observed flat
footprints around home, slowing while turning and replanning around traffic.
Evidence: `build/blockwalker-marrow-recovery-navigate/summary.json` and its
physical world/foot traces. The fresh image-22 2400 s population has 3029 supported airborne placements,
752 in the final quarter, minimum up 0.99569, one replant and no phase above
4 s. It keeps walking near home, with all originals alive.
`build/blockwalker-continuous-population-image22-0/summary.json`.

Verified in packaged source `c092744`; the
[checkpoint](../20260923-213000-codex-01/TASK.md) records served-browser evidence.
