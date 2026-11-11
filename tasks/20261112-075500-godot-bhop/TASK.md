# Airtime in Godot: the same strafe course and movement, with much better graphics

- STATUS: OPEN
- PRIORITY: 320
- TAGS: godot,game,demo,graphics,gpu

Owner (2026-11-12): "I want to recreate the bhop game from godot. The mechanics should be the same
but I want a lot better and cooler graphics."

## State (2026-11-12)

Filed.

The game today is Airtime: Foundry (`demos/bhop`, package `airtime`), C on raylib: the movement in
`bhop-movement.h` (air acceleration and strafing, friction, jumps, scroll jumping), the course in
`bhop-course.h` (the Foundry and its practice sections 1-4), the game loop, timer and records in
`bhop.c` (all `FILE` rows of `demos/bhop/Dollyfile-airtime`). Controls: A/D plus mouse turning
build air speed, Space or either wheel direction jumps, Escape pauses and releases capture, Q
exits, R restarts, 1-4 select sections.

## Do

- A Godot project under `demos/godot/` (as `lantern-drift` is): the same movement constants and
  update order as `bhop-movement.h`, the same course geometry and sections, the same controls and
  timer; new lighting, materials, sky, fog, particles and post-processing on gpu@0.
- A package that exports the project with `godot-editor` in Dolly and an application that opens
  it, as `lantern-drift` and `godot-lantern-drift` do; on the domain site's Applications.

## Done when

The application runs in Chromium and Firefox on the real adapter (`demos/godot/test/`), a run
through the course with the same inputs takes the same time as in Airtime within a frame per
section, and it looks a lot better than Airtime (screenshots in the task).
