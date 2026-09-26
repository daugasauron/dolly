# Clear loaded cargo vehicles waiting indefinitely for a handoff bay

- STATUS: OPEN
- PRIORITY: 240
- TAGS: game,controllers,cargo

The September 27 `build/living-world-20260926/long-fresh` 7,200 s populated run
keeps the channel ammunition chain working, but two upright loaders end holding
cargo in `wait_bay` for long periods. Preserve `after.lua`, `audit.csv` and
`summary.csv`; this run has terrain 5 and the current shape-aware truck programs.

- Tonbi East (62): cargo 72, three completed jobs, position
  (-19.015, .699, -5.315), up 1.0, longest stationary interval 3,340.917 s.
- Nekote (75): cargo 70, three completed jobs, position
  (45.975, .699, -11.377), up 1.0, longest stationary interval 2,047.200 s.
- Tonbi West (63) also holds 71 in `wait_bay`, but ends tilted at up .419 near
  (86.992, 1.843, -36.548). Treat that mechanical recovery separately from an
  upright vehicle waiting for a destination.

Stationary time alone does not identify the cause. Inspect each actual bay,
receiver, reservations and clearance geometry; determine whether cargo already
occupies the available slots or whether the program rejects usable positions.
Do not remove stock, disable safety checks, teleport loads or infer a deadlock
solely from a delivery counter. The snapshots retain every body's state.

Complete after replaying both upright incidents through a physical supported
set-down and downstream transfer, followed by another pickup/handoff. Use the
same generic visible program and ordinary actuators, preserve all original
actors, 20 Hz controllers and execution budgets. Verify a populated continuation,
no new controller errors/losses, save/reload and normal browser rendering.
