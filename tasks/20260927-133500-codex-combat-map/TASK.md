# Make the two island teams compete over a central industrial cargo zone

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: game,world,logistics

The user requested distinct bases and a central combat/drop zone, with cargo
collection and organization driving combat instead of unrelated skirmishes.
Keep the covered factories, quarry, mine, cranes and boats; put team machinery
on its own side, launch compact independent ammunition, and physically remove
incapacitated opponents into team scrapyards. No hidden character-specific
forces, targeting exceptions, damage or transport. Controllers remain editable Lua.

Terrain 6 adds dry salvage pits and colored rear-area markers. Central parcels
fall within the contested zone; neutral depots are transfer points, and only
island goals finish deliveries. Saved terrain versions keep their previous layout
and scoring. Map areas are exposed as data to controllers and the world view.

Verify populated competition, island deliveries, no controller errors or removed
originals, actual browser rendering, old world import, and preserved unrelated
images before closing. Related work: projectile-tethers and salvage/targeting tasks.

`build/combat-20260927/full-v11` runs 900 seconds with the 87-character catalog:
103 total objects, all originals retained, eight island deliveries, scores 3/12,
zero controller faults and zero removals. Neutral mainland staging no longer
ends a job. The earlier `full-v9` records both complete heavy logistics chains
through hauler, quay crane, boat and island receiving machinery. An East scrap
collector physically captures West Hibari and deposits it at its yard in v11;
the opposing team contests the same sort of capture in v9. The compact projectile
catches an opposing skycrane, lowers its handle, is grasped by a tug and returns
to its loading bay after the victim escapes.

Closed after actual 9097 Firefox/Chrome checks: all 87 programs/blueprints match,
terrain 6, no errors/readbacks, clean exit. Firefox restores new terrain-6 and
old terrain-5 worlds with programs/attachments intact and >16 s continued play.
Evidence: `build/combat-20260927/{local-preview-firefox,local-preview-chrome,checkpoint-restore,noon-restore}`.
`package-proof.json` and `preservation.log` verify 69 source files, six protected
saves and 56 unchanged unrelated assets. Projectile reuse remains separately open.
