# Populate the islands with larger survey landers

- STATUS: CLOSED
- PRIORITY: 240
- TAGS: game,physics,agent

The live Astra/xhigh Pi has released Cairnwing (62 parts), Vesper (70 parts) and
Rime (67 parts, with hydraulic landing legs). Preserve the exact learned designs
and controllers, verify them from a fresh start at their intended island sites,
then include successful examples in the starting world. Rime is a flyer; its
name and a stationary snapshot were previously mistaken for a rover.

Measure actual takeoff, horizontal excursion, return and touchdown from body
poses and velocities, not only controller phase/cycle counters. Check the
hydraulic legs move while the aircraft remains stable. Preserve bounded seeded
route variation and existing world objects. Include the already verified loose
cargo placements on Tidelock and Quayfin so their default routes carry loads.

Verify the resulting complete fresh population, save/reload and normal camera
controls. Update population-dependent browser interactions to select real rows
from the current catalog. Record actual frame rate and inspect GPU screenshots;
do not claim an isolated rendering benchmark while the live Pi browser runs.

Fresh-start measured evidence: all **35 objects/880 parts** survived 46.05 physics
seconds with zero removals or model requests. Cairnwing travelled 3.804 m,
Vesper 5.357 m and Rime 4.060 m from home. Actual foot positions and body velocities
show two completed takeoff/excursion/return landings for Cairnwing and Rime, and
one for Vesper. At measured touchdown every foot was within 2.5 cm of the floor,
horizontal home error below 10 cm and body speed below 0.11 m/s. Each controller
selected three different seeded route offsets. Rime's hydraulic legs moved
0.780 m. The exact Pi blueprints/controllers and original 30 placements are
preserved in the enlarged catalog.

Evidence: `build/blockwalker-landers/{landers,proof}.json` and three real GPU
frames. The probe saved/read every physical pose four times per second, so its
68.2 s wall duration is instrumentation-heavy and is not ordinary game speed.
The complete browser physics and
save/reload suite passed for the new catalog; log:
`build/blockwalker-landers-integration.log`.

Normal full-screen rendering measured **53–57 FPS** across six views of the
35-object/880-part world, with simulation/wall time ratio 0.996–1.004, zero new
removals and zero model requests. The live Pi browser was also running, so this
is a shared-workload observation. GPU images of the aircraft, loaded pier/boat
and whole world were inspected. Evidence: `build/blockwalker-fleet/fleet.json`,
six `fleet-*.png` images and `build/blockwalker-fleet-browser.log`.

Camera/prompt/focus verification passed after deriving the number of population
pages from the current catalog: real moving-body following, manual release,
safe removal of a followed body, expanded picking and nine GPU captures across
viewport layouts. Log: `build/blockwalker-landers-focus.log`. The fresh image
rebuilt inside Dolly in 16.5 s and is served on the branch's port 9099 preview.
