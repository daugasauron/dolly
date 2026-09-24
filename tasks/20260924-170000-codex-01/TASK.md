# Keep Mochi clear of delivered cargo

- STATUS: OPEN
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
Remaining: fresh continuous population and packaged browser verification.
