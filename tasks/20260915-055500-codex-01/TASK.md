# Populate the world with feedback surveyors and salvage machines

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,agent,physics

Replay the actual Pi's Sundial, Marrowstep, Kelpglass, Brinehook and Shoalhook
blueprints/controllers from empty controller memory. Measure balancing, stepping,
boat route completion, hydraulic travel, and magnetic pickup/carry/release in a
fresh populated browser world. Retain the existing 35 placements.

The live Kelpglass route stalls near the western island corner. Test its exact
controller farther south, with room for the expanded hulls and turning circle.
Give salvage cranes independent cargo and space away from the operating tender.
Bundle only measured working designs. Verify persistence and capture GPU views.
The live world and complete Pi history must remain intact.

## Measured fresh-start replay

The unchanged Pi blueprints and controller sources ran for 90.017 simulated
seconds alongside the original population: 42 objects, 1,095 parts, no removals
and no model/network requests. Kelpglass starts at -163,-90 to clear the western
island with its full hull width. Brinehook starts at 205,0 with a separate crate;
Shoalhook and its crate occupy the western sea. The first 35 placements are
unchanged. Controller memory starts empty.

| Machine | Observed behavior |
| --- | --- |
| Sundial, 29 parts | 3.597 m excursion, minimum up 0.9952, 1.579 m mast travel |
| Marrowstep, 25 parts | 13.691 m excursion, minimum up 0.9926, both directions; all four feet lift and return to floor height |
| Kelpglass, 43 parts | Six waypoint transitions, including a complete circuit; minimum up 0.9984; hull separation changes from 6.080 to 8.407 m |
| Brinehook, 47 parts | Own crate carried 2.700 m horizontally and raised 5.422 m while attached; completed all nine phases and switched magnet off |
| Shoalhook, 69 parts | Own crate carried 9.026 m horizontally and raised 6.186 m while attached; completed all nine phases and switched magnet off |

Delivered crates rest tilted across the receiving tray rails, rather than flat
on the tray bottom. They drift 1.22 mm and 0.14 mm over the final ten seconds,
with no magnetic attachment. An initial analysis assumed a flat-bottom resting
height; inspecting the actual poses showed the rail support and corrected that
assumption. The ordinary gravity simulation remained active.

Evidence: `build/blockwalker-surveyors/{surveyors,proof}.json`, five inspected
`surveyor-*.png` GPU images, and `build/blockwalker-surveyors-browser.log`.
Recording complete world state four times per second slowed this instrumented
run to 145.2 wall seconds; it is not a normal rendering benchmark.

The fresh-population browser integration passed, including separate magnetic
loads, all world identities after reopen, native actuator checks and saved
attachments/controllers. Evidence: `build/blockwalker-surveyors-integration.log`.
No live-session migration was needed for this catalog update.

The final compact catalog is built and served at the existing 9099 preview.
Build evidence: `build/blockwalker-surveyors-build.log` (19.6 s, 231,809,346-byte
snapshot). Six full-screen views ran at 33.6–46.9 FPS with simulation matching
wall time and zero removals; the separate live Pi world was running concurrently.
These shared-host measurements do not isolate GPU or per-creature cost.
Evidence and inspected images: `build/blockwalker-survey-gallery/` and its
matching browser log. No new permanent test suite was needed for this data change.
