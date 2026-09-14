# Place loose cargo on boats and elevated world mechanisms

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,physics,agent

Tidelock's loaded lift worked in practice, but the shared-world cargo tool only
spawned at the terrain/water surface. Its y argument was practice-only;
the world branch validated it but did not pass it to world_drop_cargo. This
prevents reproducing that loaded-platform experiment in the shared world using
the same placement coordinates. Quayfin currently only passes beside the pier.

Allow an explicit initial y for new world cargo and optional height for bundled
cargo placements. Preserve the current automatic surface placement when omitted.
Keep ordinary gravity, collisions and controller forces after creation; do not
move existing cargo to fake a transfer. Save/restore must preserve the resulting
physical state. Reject invalid coordinates without creating a body.

Verify a crate settles onto a real boat or raised lift, survives a complete
loaded motion cycle, and reloads correctly. Keep original ground-level magnet
pickup working. The existing root_height field describes the design's standing
height for removal checks; an elevated drop must not make a one-block crate look
like a tall torso that collapsed when it reaches the floor. Then let Pi test
actual loading/transfer, keeping that outcome separate from mere proximity.

Implemented explicit world y and optional initial-placement y in bundled designs.
Only new bodies move to the requested height; rootHeight retains the normal
standing height. Omitted world y uses the terrain/water even from ground practice.
No host, GPU or machine ABI changes.

Verification: `test/blockwalker-cargo-browser.mjs` runs actual Box3D/GPU code
inside the browser. Tidelock carried a loose alloy crate **5.699 m vertically**,
returned to the low level, and kept about **0.971 m** center separation between
crate and platform. Quayfin carried another crate on its **12.506 m** route with
at most **0.127 m** horizontal deck drift. Eight bodies survived; no removals or
model requests. Invalid API coordinates and a bundled out-of-range height created
no bodies. Crates dropped from 8 m landed normally and survived the removal grace
period. Restart preserved exact IDs, poses/velocities and rootHeight; the loaded
lift remained supported throughout another eight seconds.

The existing `test/blockwalker-agent-browser.mjs` also passed: four distinct
fresh-world magnetic cargo machines, practice pickup/lift/release, latched magnet
restoration, water/flight/bridge physics and saved-world continuation. Both browser
runs used the 4 GiB/no-swap process-tree guard. The C image build took 16.6 seconds
inside Dolly. Logs: `build/blockwalker-cargo-height-{build,browser,integration}.log`;
measured traces and GPU frames: `build/blockwalker-cargo/`.

Live update: uploaded the 364,544-byte source archive through Dolly's normal file
picker, compiled with the existing in-image cc in **3.24 s**, ran `--check` in
**5.14 s**, and replaced the binary only after success. No image reload or
conversation reimport was needed. Exact comparison retained all **35 objects**,
magnetic attachments and the full **192,426,340-byte** native history, verified by
SHA-256. Pi resumed on the same filesystem with instructions to try loading the
existing Tidelock and Quayfin. Evidence: `build/blockwalker-cargo-update.log` and
`build/blockwalker-walking/cargo-updated-proof.json`.

Pending: observe Pi using the updated tool. Cargo transfer between machines
remains unproven.
