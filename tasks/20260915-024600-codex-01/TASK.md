# Give the islands distinct space outposts

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,graphics,physics

The larger world has navigable islands but most points of interest are empty.
Add an eastern landing site, western reactor outpost and northern signal station
using the same physical geometry as their GPU rendering. Keep existing creatures
and the central workshop/harbor routes intact. Overhead beams and solar panels
must allow passage underneath without becoming false ground for survival checks.
Use matte panels, emissive markers and solar-cell shading rather than glossy boxes.

Verify native collision and ground queries, inspect all three places in the real
browser, and measure the populated scene's simulation/frame cost. Preserve the
live Astra/xhigh experiments. Its idle prompt should continue the latest request
and current experiment instead of repeatedly replacing that direction with walkers.

The first performance comparison exposed missing exported GPU headers: compiling
the previous C revision inside the finished image failed at `dolly/gpu.h`.
The source tar contains them during the build, but the module exported only its
program/source folder. Export both GPU headers so the included C source can be
rebuilt inside the final image. The failed comparison produced no measurements;
its log is retained as `build/blockwalker-outposts-missing-headers.log`.

## Verification, 2026-09-15 03:04 JST

Added 34 static boxes forming the eastern landing pad/arch, western reactor and
northern antenna/solar panels. Shared C geometry builds their Box3D collision
shapes and GPU instances. Overhangs are excluded from the base-ground query,
allowing bodies underneath; they remain solid collision shapes. Terrain shading
now supports matte alloy panels, emissive marker strips and solar cells.

The native floor, solid-beam and passage checks passed in the in-Dolly build.
The focused browser integration passed with a crate surviving under the arch,
eight total survivors and save/restart retaining removal records and loaded
magnets. Logs: `build/blockwalker-outposts-integration.log` and final native
image build `build/blockwalker-outposts-final-build.log`.

The comparison browser compiled revision 8f8bdda inside Dolly using the now
exported GPU headers. Before/after runs restored the same 15-creature, 263-part
world and inspected six actual GPU views. With the owned live simulation paused,
the old code measured 32.4–33.6 FPS and the new code 32.2–34.4 FPS. Each view
advanced at least 98% of wall time, with zero removals. This short end-to-end
browser comparison does not isolate GPU execution time. The earlier run with
the live world also rendering showed mixed per-view changes at 38–47 FPS.

Final images and measurements: `build/blockwalker-outposts/outposts-after-*.png`,
`outposts-before.json`, `outposts-after.json`; comparison log:
`build/blockwalker-outposts-comparison.log`. The final arch markers face the
normal approach view. All test browsers have exited. Live restoration is in
progress from the complete 87,224,320-byte `outposts-state.tar` recovery archive.

Live restoration finished at 03:07 JST using gzip decompression inside Dolly.
The compressed file is 63,057,451 bytes and fits the existing upload limit.
All 23 creatures returned with zero new removals. The original 85,560,164-byte
native Pi conversation is an exact SHA-256-matching prefix of the restored,
growing session. Dockhand completed its carry/lower/release phases after restore;
Loadrunner reattached its own crate for the return leg. Pi resumed its saved
hinged-knee experiment through actual Astra/xhigh requests. Its idle continuation
now reads the latest persisted request instead of a fixed walking-only prompt.
The distinct large-file transfer limitation is tracked in task 030600.
