# Airtime in Godot: the same strafe course and movement, with much better graphics

- STATUS: CLOSED
- PRIORITY: 320
- TAGS: godot,game,demo,graphics,gpu

Owner (2026-11-12): "I want to recreate the bhop game from godot. The mechanics should be the same
but I want a lot better and cooler graphics."

## State (2026-11-12)

Closed. `demos/godot/airtime` is the Godot project: `movement.gd` ports `bhop-movement.h` at
100 Hz in Airtime's units and `course.gd` its course; run natively against the C game with the
same inputs, the state matched at every checkpoint to three decimals. The package
`airtime-godot` exports it with Dolly's own `godot-editor`; the application `godot-airtime` holds
the game, the editor and the project (`/home/dolly/airtime`), on the domain site's Applications
(release `0d27c879…`, 9045). Dolly's display server captures the mouse now.
`demos/godot/test/godot-gpu-browser.mjs` passes in Chromium and Firefox on main (03372976a, the
round's `gpu-godot-after.log`): WebGPU forward_plus, autopilot through 16 pads or more with at
most two falls. Natively the autopilot finishes the course in 20.83 s without a fall.
Screenshots: `airtime-raylib.jpg` (the C game in Dolly, the release's `bhop`) and
`airtime-godot.jpg` (Godot, frame 420 of an autopilot run, native at 1920x1200: lava with
embers, lit plates, glowing pipes and windows, starry sky).

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
