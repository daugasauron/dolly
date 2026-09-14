# Distribute the larger learned machines and repeated cargo placements

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,distribution

The live world includes Lowrider, Loadrunner, Threewake, Landfreighter and
Strideglass, but new browser sessions still receive the earlier 15 starters.
Include these tested designs/controllers and the carrier's separate crate.
Keep existing saved worlds unchanged and preserve the original learned designs.

Library deduplication currently also removes repeated initial placements of an
identical crate because first launch spawns from the deduplicated library. Keep
design identity deduplicated while allowing multiple initial placements from
the bundled data; do not invent different names to bypass deduplication.

Verify a fresh image runs the larger walkers, boat and both magnetic cargo
systems without model access. Both cargo boxes should share one library entry,
have distinct world identities, and be handled by their respective machines.
Check reload does not duplicate the population and the existing empty-world,
editor/library, physics and restoration checks still pass.

## Verification, 2026-09-15 03:25 JST

The image now starts 21 objects with 403 parts from 20 distinct designs. It
includes the five newer learned machines and Loadrunner's separate cargo.
Initial placements are instantiated while parsing the bundled rows, independently
of library deduplication; existing saved worlds still only load their own actors.
World mode now displays the population's object/part totals in the header.

Both focused browser suites passed under separate 4 GiB/no-swap scopes. Six
exports over 18.93 simulation seconds retained all objects with no removals.
Both cargo systems lifted distinct crates while sharing one library design.
Loadrunner delivered its crate 4.03 m from pickup, then reattached it for return.
Landfreighter advanced 7.63 m and Threewake 11.10 m, both upright. Reload preserved
all identities without adding copies; explicit empty-world and subsequent physics,
editor/library, magnet, overhang and saved-world checks passed. The initial world
issued zero network/model requests.

A separate final browser run captured six actual GPU views, including close
views of the larger walker, carrier, boat, trot and flyer. It measured 50–57 FPS
with simulation matching wall time and all 21 objects/403 parts retained. The
live Pi world was also active; these short measurements are not an isolated
GPU comparison. The final header was visually checked.

Evidence: `build/blockwalker-larger-starters-integration.log`,
`build/blockwalker-larger-starters-editor.log`, `build/blockwalker-showcase.log`,
`build/blockwalker-showcase/showcase.json` and its PNGs. All test browsers exited.
