# Let learned controllers use their runtime budget instead of a 16 KiB source cap

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,agent,iteration

Pi's quiet-arm comparison with force diagnostics was rejected at 17103 bytes.
It then spent another model turn trimming diagnostics and was rejected again.
The arbitrary 16 KiB source gate prevents useful investigation; the controller
already has a 4 MiB QuickJS heap, 128 KiB stack and bounded execution per call.

Remove the source-length rejection from installation and saved-design loading.
Keep the actual runtime limits and controller validation. Verify a trajectory
controller with real embedded data above 16 KiB, actual motor movement, exact
save/reload, and graceful rejection when compilation exceeds its heap budget.
Retain a valid installed program after a rejected replacement. Apply inside the
owned sandbox without rebuilding/migrating the full image for each source edit;
include it in the next packaged checkpoint.

Implemented in installation and saved-design loading. Focused real-browser
check 63988 passed: a 23652-byte, 2048-point trajectory drove its hinge to
.532092 rad after 120 steps (target .568661), survived a fresh process restart
exactly, and retained the valid installed program after a 5 MiB literal exhausted
the compiler heap. Evidence: `build/slopyard-large-controller-proof/`.

Compiled directly inside the owned Dolly session and applied to its installed
command. The actual rejected 17103-byte Pi source now installs successfully.
All 53 world objects, 78 designs, poses, velocities, memory, removals and world
time matched exactly after reload. The named session contains the modified
2393894-byte executable and exact source files. Its entire 385650233-byte Pi
history retained SHA256
`78cf9557263ddee7a5214d950452913bb61e6f7ef8fa6ec3cd0a61831c88e83d`.
Evidence: `build/slopyard-walking/source-limit-{probe,build}.json`.
Continuation uses the normal prompt box, Astra/xhigh and timed GPU images.

Full browser integration with the current C and permanent restart fixture
passed (47864 terminal 0, 4 GiB/no swap). It exercised magnetic cargo, buoyancy,
hover feedback, controller timeout and exact pre-tick restoration.

Packaged and reverified on 2026-09-23. C built inside Dolly in 20.7 s, reusing
all dependencies. Image SHA256
`65e99be9e04e3a0e1741230f1707372ffc381bbcaa7529085ed5ae8851a15735`;
source tar `d3976c3f8c2300fedc8ecbe2d11893fd24b62be5edbbb88657dc44813831f7d3`.
The packaged integration suite passed, including the large trajectory and
compiler-heap rejection; full saved-design equality passed on a fresh process.
Log: `build/slopyard-september-integration.log`, handle 65383 terminal 0.
