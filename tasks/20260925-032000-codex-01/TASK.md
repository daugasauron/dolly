# Add cargo-fed anti-air machinery

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,content,physics

Build red/blue industrial throwing machines whose editable programs aim at
opposing aircraft and throw ordinary light cargo. A separate machine must
physically reload each launcher. Use normal motors, magnets and contact
physics; no actor-specific steering, launch impulse, guaranteed hit or teleport.
Keep thrown crates and fallen aircraft in the world. Verify repeated loading,
release momentum, moving-aircraft engagement, save/restore, rendered appearance
and interaction with the combined cargo world.

The branch catalog in `020e1c1` contains both crews and three 0.913 kg alloy
crates per launcher. Braced masts, ordinary 100 Nm yaw/arm turntables, vertical
loading rams and magnetic tips suffice for the tested assembly; a larger
bearing is unnecessary for this prototype. All aiming, predicted ballistics,
spin limits and radio handoffs are visible embedded programs. The only related
engine observation change is generic nearby vertical velocity.

`build/blockwalker-launcher-safe-spin/` completes three physical handoffs and
shots in 240 s. Two crates hit a moving aircraft at 54.333 and 163.767 s; the
second shot misses. The aircraft recovers, so this is not proof of a shootdown.
The small rendered world reaches 60.71 warm FPS in Firefox; appearance and
loading views are in `build/blockwalker-rivalry-view-firefox-crowded-slinger/`.
This small-world result does not prove crowded-world performance.

A populated 1800 s trial records cargo 86 contacting aircraft 8 at 778.183 s,
after release at 775.85 s (`build/blockwalker-rivalry-one-way-teams42/`). That
trial also exposed unwanted releases when targets left sensor range. The
current program brakes while retaining its load. The lost-target trial holds
the same crate for 127 sampled seconds and then completes three reloads/shots;
two crates contact the aircraft at 182.350 and 217.450 s. Evidence:
`build/blockwalker-launcher-lost-target-ammo/`.

Saving and reopening at 90 s preserves the held load and resumes firing twice.
A third load later slips; the feeder recovers it and begins another delivery.
This is a remaining physical limitation, not a guaranteed-shot demonstration
(`build/blockwalker-launcher-loaded-reopen/`). The fresh combined run, final
camera/source checks and image packaging remain pending.

[Rope and winch links](../20260925-041500-codex-01/TASK.md) are a separate open
investigation. The first motor-driven slinger does not require them.

Closed at the image 28 checkpoint. The 2400 s populated run retains all cargo
and machines while both slinger crews operate
(`build/blockwalker-rivalry-checkpoint42/`). Chrome/Firefox camera, following
and exact program export pass in `build/blockwalker-world-ui-{chrome,firefox}/`.
Both browsers then launch the packaged crews and restore the populated save:
`build/blockwalker-image28-preview/` and `-firefox/`. Sidebar names now distinguish
Tengu launchers from Koban feeders. The observed slipping/recovery limitation
remains; this does not promise reliable shootdowns or implement ropes.

The user's subsequent live report found unstable bearings and repeated loader
collisions. The narrow-bearing prototype is being replaced under
[the broad-turntable redesign](../20260925-080000-codex-01/TASK.md). The earlier
isolated successes did not establish robust operation of the original crews.
