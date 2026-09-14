# Run an embedded Pi creature playground overnight

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,agent,gpu

Remove the 64-part limit. Keep the character builder and embed Pi directly in
the game, with a local Codex subscription proxy and one Dollyfile for the whole
application. Agent/game actions must be direct calls, not command files.
Allow the agent to construct and program many creatures, including random
behavior. Run a shared world that removes fallen characters and keeps survivors.
Add WebGPU scenery/effects while retaining matte parts. Leave an actual agent
running and verify it populates the world with varied creations.

Completion needs browser evidence for a character exceeding 64 parts, builder
editing/save/load, direct Pi tool actions through the real proxy, executable
creature programs, concurrent live creatures, culling and persistence. Record
the live job handle and observed autonomous progress; setup alone is insufficient.

Steering: use `gpt-6-astra` through the proxy. Pi learns through held/released
joint keys in a practice playground, observing a few timed framebuffer captures
(before/midway/after an action), then embeds the learned control pattern into a
character program. Capture actual GPU output only at requested times. The local
Codex catalog confirms Astra supports image input; subscription login is valid.

Further steering: use `xhigh` reasoning. Survival alone was unsatisfactory: the
first twelve creations were mostly stationary broad platforms. Demonstrate
measured walking, then keep exploring moving designs. Add key-controlled
telescoping pistons, directional thrusters and motorized wheels. Complete the
existing HTTP response-limit task and remove the separate 1 MiB process upload
bottleneck that rejected requests containing several framebuffer images.

## Browser evidence, 2026-09-14

- Chrome/NVIDIA: 160-part editing, underside placement, save/import, keyboard
  motors and restart passed (`build/blockwalker-final-editor.log`). Ordinary
  rendering performed no GPU readback. Direct embedded tools, three timed PNGs,
  controller timeout containment, culling and world restoration passed
  (`build/blockwalker-pause-browser.log`).
- Actual proxy requests used `gpt-6-astra`, `xhigh`, including 1,775,016-byte
  image-bearing requests (`build/blockwalker-walking/requests.jsonl`). Pi restored
  its full saved conversation. Pause and Escape returned to Slop during inference;
  restart resumed learning. Raising the HTTP deadline allowed a request exceeding
  two minutes to finish, followed by successful game tools.
- Pi learned a 21-part hydraulic quadruped: 4.05 blocks in ten practice seconds,
  then 99.66 blocks in 200.18 shared-world seconds, torso up 0.99985. It eventually
  walked off the finite floor. A six-legged beetle also walked; Pi subsequently
  learned forward/reverse pacing and released three home-ranging beetles.
- Wheels, pistons and thrusters use actual Box3D constraints/forces. A grounded
  four-wheel cart travelled 7.942 m in six seconds and reversed to 0.511 m from its
  start, upright 0.9999999 (`build/blockwalker-wheel-browser.log`). This test caught
  and fixed an off-center cylinder and insufficient wheel clearance; it now runs
  in the C build checks. No balancing assistance was added.
- Game C sources were rebuilt inside the live Dolly instance while keeping the
  Pi conversation and world (`build/blockwalker-live-update.log`). The latest
  image is built; the preview is `http://127.0.0.1:9099/blockwalker/`.

The dedicated Chrome profile is `/tmp/dolly-blockwalker-walking-20260914`, CDP
9231. Its `blockwalker-feedback` saved session and `build/blockwalker-walking/`
hold progress. The local relay listens on 9010; its private configuration is
imported into the browser only. The agent remains active after the verified
population checkpoint.

Further steering: expose actual physics feedback to character programs so they
can implement PID balance, contact-aware walking and controlled flight. Added
orientation, world/body angular velocity, local gravity/velocity, joint rates,
contact sensing, mass and centres of mass; proportional key strengths and optional
60 Hz programs; and direct `program_trial` with timed GPU observations. Legacy
10 Hz programs keep their timing. No automatic balancing was introduced.

Real browser experiments: a five-part Segway recovered from a 0.25-second drive
pulse and stayed upright for 20 seconds; its no-feedback comparison fell and was
culled (`build/blockwalker-segway-browser.log`). A four-thruster PID flyer recovered
from asymmetric thrust and settled at 4.550 m for a 4.5 m target, vertical speed
-0.0133 m/s and up 1.0 (`build/blockwalker-proof/blockwalker-feedback.json`).
The final integration check also restored the flyer from the shared-world save
and verified its 60 Hz controller kept flying; two older 10 Hz programs retained
their rate (`build/blockwalker-feedback-final-browser.log`). Original editor
behavior passed again (`build/blockwalker-feedback-editor.log`); 38 focused
HTTP, relay and recipe checks passed (`build/blockwalker-final-source-tests.log`).

Astra itself used `program_trial` to learn a four-part Segway with velocity PI
and pitch PID feedback: 4.048 blocks at ten seconds, returning to 1.426 blocks
from its start at twenty seconds, torso up 0.9997. It released that controller
at 60 Hz. Ten live survivors across six designs were saved and restored into
the final image, including legged walkers, wheel shuttles, a hydraulic rover,
a pulse-jet creature and the Segway. The complete Pi conversation was preserved.
See `build/blockwalker-feedback-progress.log` and
`build/blockwalker-checkpoint-restore.log`; current progress remains under
`build/blockwalker-walking/`. Pi continues autonomously through the relay.
