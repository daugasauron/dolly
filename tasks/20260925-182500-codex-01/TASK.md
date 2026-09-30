# Let the yard porter leave a pickup beside machinery

- STATUS: CLOSED
- PRIORITY: 240
- TAGS: game,content,bug

The porter selected an outward avoidance heading but stopped based on the raw
inward goal direction, leaving it permanently loaded beside the carousel. The
three-line correction checks clearance against its actual chosen heading,
retaining the same radii, speed, repulsion and physical wheel controls.

Exact300→480s comparison changes only38: parcel97 delivered around337s,98
magnetically picked377s and delivered402s;3 deliveries/4 trips by480s. The
unchanged60s replay cannot leave. All107 earlier actors/other programs and
machine blueprints remain, with no errors/deaths or porter/carousel contacts.
Evidence: `build/slopyard-compound-regressions-chrome-carousel-porter-
clearance/salvage/porter-proof.json` and full trace.

Separate physical obstructions required taller carousel heads, including room
for suspended cargo; steering alone could not fix those. The final93-part
carousel clears both. Fresh1500s run delivers all3 carousel parcels and porter38
completes6 deliveries. Its later tip near parcel41 is separately tracked in195201;
that later event is not claimed fixed here.

Packaged in image37. Chrome/Firefox match all98 catalog programs/blueprints
and restore old plus loaded worlds; see `docs/crash-handoff.md` for evidence.
