# Keep Mochi clear of delivered cargo

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,game,physics

The image-21 uninterrupted seed-0 population removes Mochi (38) at 875.567 s
near the Works depot: (-2.951,1.687,35.463), up -0.138. Its root rises and tips
beside delivered cargo 40; the nearby objects are crates 39–41. Its steering
currently skips every cargo body. Inspect actual controller state and contacts,
then retain delivery and withdrawal without driving over deposited cargo.

Evidence: `build/blockwalker-continuous-population-image21-0/segment-3600/`.
Despite the directory label, the run stopped at 875.567 s, not an hour.
Final world, root/foot traces and removal record were downloaded. Checkpoint
collection failed because Dolly's bootstrap tar only extracts; the diagnostic
rerun uses paced individual downloads instead. Do not report this as a passing
population trial. Verify the actual encounter and continued freight/walking
with all original objects alive after the repair.

The diagnostic rerun again removes Mochi after about 875 s. It had completed
six deliveries, then entered search and drove through crates 39–41. Actual
contacts include wheel 6 against delivered crate 40. A physical checkpoint
at 780 s retains all sixty originals and the porter's current search goal;
all fourteen one-minute checkpoints were downloaded successfully.
Evidence: `build/blockwalker-continuous-population-porter-reproduction/segment-0900/`.
The comparison changes only the porter's source in that saved world.

From the same 780 s physical checkpoint, the old controller reaches minimum up
0.83343 and 173.391 N wheel contact with delivered cargo over 120 s; it survives
this reload, so this is a contact/tilt regression rather than an identical death.
The cargo-avoidance controller runs 300 s with minimum up 0.99999, maximum
wheel/cargo contact 11.210 N, 159.256 m travelled, one further delivery and no
removals. All sixty originals remain. Only its source changes; crate positions,
physics, delivery records and all other controllers are preserved.
It steers around cargo while excluding its pickup target and carried load.
Evidence: `build/blockwalker-porter-recovery-avoid-cargo/`.

The repaired 2400 s fresh population preserves all 60 originals and records
34 deliveries (East 42 / West 29), with continuing heavy and light deliveries
for each team. Mochi reaches eight deliveries without tipping (minimum up
0.98278), then carries air parcel 82 toward the Harbor depot. It circles at
the narrow shoreline approach: carry lasts 1130.733 s, with only 6.405 m of
root range in the final quarter. The other walkers, scouts and team carriers
remain active. Evidence: `build/blockwalker-continuous-population-image22-0/`.
This is a separate destination-selection problem exposed by survival repair.
Choose the depot nearest the yard porter's home and reroute an already loaded
save through its existing motors. Verify actual settling/credit, not travel
alone. The same 2400 s state with the old controller runs another 60 s, moving
53.850 m but retaining the same undelivered load. The depot-only candidate moves 101.458 m over 300 s and reaches Works, but
existing crates block its fixed unloading approach; its delivery assertion
fails. Evidence: `build/blockwalker-porter-home-recovery/`. Evaluate clear
approaches around that same depot, retain the load and require a new credit.

The first clear-approach candidate chooses an unobstructed unloading position
but circles about 1.5 m from it at its existing approach speed. It travels
260.754 m and remains upright, but still has eight credits after 300 s, so the
delivery assertion correctly fails. `build/blockwalker-porter-home-clear-approach/`.
Reduce speed proportionally during the final four metres of carrying approach;
retain normal transit speed, physical steering and cargo collision avoidance.

The complete repair recovers the original 2400 s loaded save: parcel 82 is
physically released and credited to Mochi at 2495.267 s. The 180 s replay ends
with nine deliveries, all sixty originals alive, no removals, minimum up
0.99970, 156.465 m travelled and zero wheel contact with delivered cargo.
The program keeps deliveries near home, selects a clear unloading approach
from observed cargo and slows during final alignment. No bodies, forces,
saved poses or cargo are changed. Evidence:
`build/blockwalker-porter-home-slow-approach/current-world.json` and its trace.

Verified in packaged source `c092744`; the
[checkpoint](../20260923-213000-codex-01/TASK.md) records served-browser evidence.
