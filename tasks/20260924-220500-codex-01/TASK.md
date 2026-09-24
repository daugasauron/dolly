# Physically store retained cargo so receiving yards stay usable

- STATUS: OPEN
- PRIORITY: 300
- TAGS: game,physics,content,bug

The seed-42 uninterrupted retention trial completes 1800 s with 99 bodies and
28 deliveries, but its final-fifteen-minutes heavy-delivery assertion fails.
The first East/West pallets score at 541/787 s. Cranes 57/58 then remain in
`swing`, holding pallets 79/85 against retained pallets 71/75. The barges wait
in `unload`. No controller errors or disappearing objects caused the blockage.
Reproduction and exact saved poses/program memories are under
`build/blockwalker-retained-population-first/segment-1800/`.

Test a physical warehouse handler using an ordinary embedded program and
standard pistons/magnets. Clear the existing failure state, keep scored cargo
visible and manipulable, and verify repeated heavy handoffs for both teams.
Do not delete, relocate, weaken or ignore cargo collisions. Check the resulting
machines and team colors in Chrome/Firefox before updating the owned preview.

The first handler could not even observe pallet 71: twelve closer light parcels
and couriers exhausted the shared `nearby` array. Removed that count cutoff;
observations remain local (48 m) and sorted by distance. The lifecycle fixture
now checks a real controller finding uncollected cargo beyond 18 closer stored
crates, while excluding an out-of-range crate. Passed inside Dolly in
`build/blockwalker-storage-neighbors/lifecycle.log` along with retention,
error/reload and physical recovery checks. Measure rendered population cost
before packaging this wider observation set.

Experimental handlers live under `build/blockwalker-storage/`. The long
telescopic gantry sags; it is not canonical content. The smaller forklift's
first two replays exposed wrong-target gripping and a low fork striking the
raised landing pad. Gripped object/part IDs now use the same shared sensor path
as saved magnet attachments. Test raised transit and an unobstructed approach
to the pallet; do not add an engine movement exception.
