# Keep roaming lookouts clear of cargo

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,bug,physics

The 51-object dock-courier candidate, seed 42, loses the Works-yard Komame at
986.40 s: root tipped over at (0.877,1.649,34.694), beside delivered crates.
`build/blockwalker-dock-population-fresh-42/segment-0900/` preserves the preceding
world; the full run retains 50 objects at 1200 s. The controller excludes all
cargo from both social choices and collision avoidance. Cargo should stay out
of social target selection while remaining a physical obstacle.


The exact 900 s checkpoint reproduced the 986.40 s removal. Contact logging
recorded 357 external samples, exclusively cargo 39/40/41; first contact was a
wheel striking crate 39 at 979.35 s. The same checkpoint with cargo included in
avoidance ran to 1080 s with all 51 objects intact, no external lookout contacts,
minimum uprightness 0.99985 and 214.59 m travelled. Social goal and head-tracking
selection still exclude cargo. Logs: `build/blockwalker-lookout-{baseline,avoid}.log`.

A small real-physics regression spawns Komame approaching three loose crates.
The original controller makes 790 crate contacts and tips at 14.6 s; the
corrected controller passes the row with zero contacts, minimum uprightness
0.99645 and reaches z=45.03 from z=20. This is now part of the existing playground
fixture (`build/blockwalker-lookout-regression.log`, old status 126 / new 0).

The fresh 51-object population passed 1200 s and six process/world reloads with
no removals and ten deliveries (`build/blockwalker-dock-population-cargo-42.log`).
The formerly failing yard lookout travelled 1340.72 m, minimum uprightness
0.99971, while retaining social visits and head tracking.

The rebuilt image passed the packaged playground regression and normal 9099
browser check (`build/blockwalker-dock-driver.log`,
`build/blockwalker-dock-preview.log`). Package details are recorded in
`20260924-062500-codex-01`.
