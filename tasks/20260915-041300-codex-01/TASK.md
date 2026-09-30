# Include the polar gantry, tender and hydraulic service pier

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,distribution

Bundle Northline with its own cargo, Quayfin and Tidelock from the preserved
live world. Verify their actual motion in a fresh image: elevated-island cargo
pickup/delivery, a narrow boat approach/return lane, and two-stage lift travel.
Keep all older creations, saved-world identities and the full Pi conversation.

Cargo checks must measure lift relative to each crate's local floor; a fixed
world height would wrongly accept a crate merely resting on the North ridge.
The tender passes beside the pier; do not describe this as demonstrated boarding
or cargo transfer. Capture real GPU views and check the complete fresh population.

## Verification, 2026-09-15 04:22 JST

Fresh images now contain 30 objects/679 parts, including the three mechanisms
and Northline's separate fourth crate. Compiled C inside Dolly and passed the
browser integration under a 4 GiB/no-swap scope. Ten samples over 30.68 simulation
seconds retained every object with zero removals and no model requests. All
four magnetic carriers lifted distinct cargo through a measured vertical range.

Northline's crate rose from y=6.485 to 7.561 and travelled 5.630 m; the machine
returned home. Quayfin travelled 12.245 m from spawn, then returned along the
same lane, with 0.0284 m maximum lateral deviation and minimum up=0.99749.
Tidelock's second stage travelled 5.586 m while the anchored root stayed fixed.
Saved-world identity and magnetic-attachment restoration checks also passed.

Five full-screen GPU views passed at 1280x720, retaining all objects and matching
simulation to wall time. Observed rates were 55–58 FPS while the live Pi world
also ran; these short measurements do not isolate GPU cost or establish a
performance improvement. The gantry, pier and boat images were inspected; the
boat and pier were recaptured from seaward because the landward view hid them
behind the shoreline. No boarding or boat-to-pier cargo transfer is claimed.

Evidence: `build/slopyard-service-build.log`, `build/slopyard-service-integration.log`,
`build/slopyard-service-proof.json`, `build/slopyard-service-gallery.log`
and `build/slopyard-service/`. All test browsers exited. The live Pi world
was not migrated; this change only updates fresh-world population data.
