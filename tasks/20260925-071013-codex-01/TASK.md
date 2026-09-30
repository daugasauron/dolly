# Unblock the next warehouse pickup after chassis recovery

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,content,bug

The warehouse repeatedly drove its magnet into a gantry column while approaching
pallet104. Contact measurements reached160..253N: checking wheel width omitted
the four-metre front overhang. A radius-only replacement rejected usable routes;
planning around the blueprint root also failed because turns move that root.

The program now plans position and heading around the measured wheel centre,
checks current part/load footprints and vertical clearance, completes turns on
heading, and accepts an actually clear supported storage position. Planning
remains bounded to two expansions per callback with the same physical controls.

Exact1500→1920s replay: both warehouses complete their next store (jobs1→2),
East104 at1696s and West109 at1772s. All125 original actors/other programs and
machine blueprints remain;129 final objects,36 deliveries, no errors/deaths or
crew collisions. Evidence: `build/slopyard-compound-regressions-chrome-
warehouse-clear-proof/salvage/`, including storage-events.json and salvage-proof.json.

Fresh competition-v5 has Westjobs1; East receives no delivered heavy cargo and
correctly stays seek in all750 samples. The raw unconditional storage-quota test
therefore returns1; it is retained, not reported as passing. Both warehouse
sources/blueprints match the successful loaded-cargo replay. Missing East input
is separately tracked in195202.

Packaged in image37. Chrome/Firefox match all98 catalog programs/blueprints
and restore old plus loaded worlds; see `docs/crash-handoff.md` for evidence.
