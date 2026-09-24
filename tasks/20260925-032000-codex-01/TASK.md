# Add cargo-fed anti-air machinery

- STATUS: OPEN
- PRIORITY: 200
- TAGS: game,content,physics

Build a team-colored industrial throwing machine whose editable program aims
at opposing aircraft and throws ordinary light cargo. A separate machine must
physically reload it. Use ordinary motors, magnets and contact physics: no
actor-specific C steering, launch impulse, guaranteed hit or cargo teleport.
Keep thrown crates and fallen aircraft in the world.

Measure whether the current turntable supports the rotating assembly before
adding a larger part. Box3D already supplies distance joints; a slack rope can
use the upper distance limit with zero spring hertz and an inactive lower
limit. A rope remains optional for the first motor-driven launcher.

Verify physical loading, release momentum, repeated shots, a moving-aircraft
engagement, save/restore, rendered appearance and the combined cargo world.
Record misses and limitations honestly.

The motor-driven prototype uses a braced mast, vertical loading ram, normal
100 Nm yaw/arm turntables and a magnetic tip. A separate crane brings 0.913 kg
alloy crates. All aiming, predicted ballistic flight, grip/release and radio
handoff are editable character programs. Generic nearby sensing now includes
vertical velocity; no launch-force operation was added.

`build/blockwalker-launcher-moving-reload/` records a deliberate shot at
46.133 s and actual contact with a moving aircraft at 48.650 s. The aircraft
recovers; this does not demonstrate a shootdown. That prototype stalled on its
second reload because the two overhead magnets interfered. The newer hoist
prototype (`build/blockwalker-launcher-hoist-reload/`) completes four reloads
in 240 s but deliberately releases only one shot; later loads slip from the
magnet. Fix repeated firing and stale radio readiness before promotion.

The existing bearing supports the tested arm with mast bracing. A wider bearing
and a slack rope remain design investigations, not implemented parts. Record
an explicit decision about each before closing this task. Candidate sources
are in `build/blockwalker-launcher/`; nothing is in the default world yet.
