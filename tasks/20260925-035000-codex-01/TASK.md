# Make thrusters one-way and keep their exhaust faces open

- STATUS: OPEN
- PRIORITY: 210
- TAGS: game,physics,compatibility

A thruster has one firing key and a nozzle direction. Thrust acts opposite the
nozzle, and both placement and orientation edits must refuse a neighboring
block on that face. Render one nozzle and flame. Apply the same rule to imported
new blueprints, not just mouse placement.

Existing programs use reversible engines. Upgrade old character/world formats
into physical opposing jets while preserving keys, original body indices,
programs, memory and saved motion. Back up the original world before automatic
upgrade. Explicitly test blocked old mounts, save/reopen, import rejection,
one-way force on all axes and actual aircraft/boat behavior after conversion.

The in-Dolly C physics suite passes with one firing key and all six nozzle
directions. A 24 N jet produces 4.8000 kg m/s of momentum in 0.2 s, with the
expected opposite sign. Placement/orientation checks reject a blocked nozzle.
Evidence: `build/blockwalker-thruster-conversion4/`.

The import fixture and real browser import/export workflow pass. A disposable
copy of the original world preserves all 51 creatures and 78 programs,
original body poses/velocities, memory, seeds and attached magnets. Automatic
startup migration writes the original version-1 world to a numbered backup;
the upgraded version-2 world round-trips exactly. Invalid new jet imports are
rejected. Evidence: `build/blockwalker-import/physics.log` and
`build/blockwalker-thruster-import4.log`. Protected recovery files were not
modified.

The first fresh-world run revealed asymmetric relocation of engines whose
old exhaust faces were blocked by landing legs. Mount selection now preserves
radial symmetry in equal-distance choices. Aircraft/boat verification, the
single-key builder UI, final catalog promotion and image packaging remain.
