# Release an air courier's magnet when it grabs the wrong machine

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: bug,game,physics

The 68-object mine population lost East air courier 59 at 1047.433 seconds.
While pursuing air parcel 88, its powered magnet attached to Sundial 5, part 28.
The pickup controller continued chasing the parcel while tethered to the moving
machine and eventually tipped over. The saved state at 1020 seconds contains the
wrong attachment; the intended cargo is still on the ground.

Reproduction and traces:
`build/blockwalker-mine-continuous-image24/segment-1800/`.
Keep the actual world, controller memory and magnet attachment when reproducing.
Both team couriers share this controller. Release a non-job attachment, abandon
that pickup and climb away. Verify the saved failure and continued real cargo
collection without changing magnetic physics or suppressing removals.

Both courier programs now detect an attachment whose cargo is not their job,
release it, abandon that pickup temporarily and climb away. The exact saved
1020 s world is replayed in `build/blockwalker-air-resume-first/`: the original
controller tips after 28.183 s; the fixed one releases after 0.0333 s and survives
150 s with minimum up 0.91244, zero removals and continued deliveries.
`check_wrong_air_grip` in `test/fixtures/blockwalker-playground.c` also uses an
actual magnet attachment to an obstructing beam, then verifies release and climb
above 30 m. `build/blockwalker-mine-continuous-final0/` then runs the 70-object
population continuously for 1800 s with zero removals. Both couriers keep
delivering: five East and seven West deliveries, including deliveries after
1700 s. A separate mine-porter stall is tracked independently.
