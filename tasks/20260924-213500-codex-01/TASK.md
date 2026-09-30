# Keep deliveries and fallen machines physically present

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,physics,bug

Delivered replenished cargo was erased 45 seconds after scoring. A tipped or
sunk character was removed after two seconds, preventing physical salvage or
programmed recovery. Remove both disappearance rules. Preserve delivered cargo
and score attribution through reload and later pickup. Let world and practice
controllers keep working after a fall; recovery uses ordinary actuator commands.
A controller exception should stop commands and retain an inspectable body,
source and error. Invalid/nonfinite physical states still require containment.

The C fixture `test/fixtures/slopyard-lifecycle.c` exercises actual delivery,
120 s of retained cargo, reload/re-grip, a stopped motor program with persistent
error/call count, and a body left overturned for 106 s before its embedded
thruster program rights it. Practice recovery also runs the full 7740 steps.
Source-only browser evidence: `build/slopyard-retention-practice/`.
The integration scenario passes with 10 retained bodies, no removals, preserved
controller errors and an exact save/reopen comparison:
`build/slopyard-retention-integration-first/`.

The uninterrupted 1800 s population run retained all 70 originals and every one
of its 28 delivered cargo bodies (99 objects total), with no controller errors,
falls or removals. Evidence: `build/slopyard-retained-population-first/`.
Its continued-heavy-delivery assertion correctly failed: both receiving cranes
collide with their first retained pallet while swinging the next one. This is
tracked in 20260924-220500-codex-01; do not restore the deletion timer to fix it.
Source-only Chrome/Firefox rendering passes in
`build/slopyard-retention-view-{chrome,firefox}/`: approximately 59/54 FPS,
near real-time simulation, all 70 originals, no removals, controller failures,
page errors or HTTP requests. East/West fleet panels and depot marks are red/blue;
all canonical models/programs are otherwise unchanged. Chrome also recompiled
and passed the full lifecycle fixture, including crowded-yard observation and
the actual gripped cargo/block identity. The preview remains on image 27 while
physical warehouse handling is developed in the separate receiving-yard task.
