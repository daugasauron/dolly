# Connect the salvage gantry to a dock courier

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,cargo,physics

Brinehook previously completed one salvage operation and parked with its crate
on the tray. It now collects another reachable crate after the tray clears.
Kawasemi, a 12-part flying courier with four thrusters, a magnet and Eyes,
collects released tray cargo and delivers it to the Island depot. The starting
world includes one extra submerged supply crate: 51 objects / 1204 parts /
31 designs, including 35 characters.

`nearby.magnetHeld` distinguishes magnetic attachment from riding on a carrier;
`magnets.targetMass` reports the actual attached body's mass. Both are derived
from physics and preserve existing save/scoring semantics. The flight controller
compensates for payload weight; instantaneous magnet load caused unstable
feedback in the first prototype. Depot release averages measured support force
because tilted crates produce intermittent contacts. Supply positions avoid
the gantry tray's obstructed pickup lane.

The isolated pair completed two physical deliveries in 400 s, including a stack
at the depot. Repeating across five save/reload cycles also passed, minimum
courier uprightness 0.98273; its only contact partners were the two crates.
Logs: `build/slopyard-dock-{repeat-clear,restart}.log`. The permanent playground
fixture checks gantry grip, released tray support, courier grip, delivery,
non-overlapping magnetic ownership and restart continuation.

The first full-population trial exposed a lookout/cargo collision, fixed in
`20260924-065600-codex-01`. The corrected fresh population passed 1200 s across
six process/world reloads: all 51 objects, no removals, ten deliveries.
Kawasemi delivered at 86.03/228.55 s, travelled 738.81 m and kept uprightness
>=0.98275. Marrowstep made 1498 supported airborne placements, including 385 in
the final five minutes. Evidence: `build/slopyard-dock-population-cargo-42.log`.

Image 16 rebuilt inside Dolly in 26.3 s (`build/slopyard-playground-image16.log`).
The packaged physics/driving suite passed (`build/slopyard-dock-driver.log`),
including both new regressions, cargo pickup and 73 Eyes-camera samples.
Actual 9099 served-image checks matched all catalog controllers and showed a
loaded courier travelling 6.44 m with all 51 objects intact and no browser errors.
Follow/Eyes GPU views were inspected. The five-second Chrome/NVIDIA sample was
36.58 FPS (`build/slopyard-dock-preview.log` and matching directory).

Package: 232147096 bytes, SHA-256
`a01ebdb9e7d33fa2a3deaa462b21a4861b143c754b0f2e09aea5aa3c57f965c1`.
Source tar SHA-256:
`146000ccf4caca3849609d897fa33b9a1324eed328778ab98853ac6999528c7f`.
The runtime, original learned session and native Pi history are unchanged.
