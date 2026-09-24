# Blockwalker handoff

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. The earlier retro and September 14
checkpoint branches remain preserved. Do not modify the parent worktree or
other agents' previews.

The [cave/embedded-driver checkpoint](../tasks/20260924-185000-codex-01/TASK.md)
is complete: 70 original objects, 51 designs, terrain 2, and a visible generic
keyboard program instead of the C driver helper. Image 27 is 232415220 bytes,
SHA-256 `6aded83091091923b17fc999832c82fe4157f16f6d21b9e3fdb8f4ca9a6ad82c`;
source archive `0f9289f5e3efdf2ead04633759effaaf048759cce7578385b40eb33684800a84`.
Chrome/Firefox, physical driver input/edit/restore, long population runs and
controller budget evidence are linked from that task.

The active [overnight goal](../tasks/20260924-211600-codex-01/TASK.md) continues
through September 25, 2026, 07:00 JST (September 24, 22:00 UTC): retained cargo,
more physical handoffs/terrain, red/blue teams, sabotage and defense, and fallen
machines that remain and can recover. Every character's behavior must be a
visible embedded program using common sensors and actuators; no per-character
engine helpers. Start from this tested checkpoint. Lua/YAML remains separate.

Source commits `08fc6e3`, `249bcd2` and `737c350` retain cargo/fallen bodies,
expose all neighbors within 48 m and actual magnet targets, add solid quarry
terraces (terrain 3), and support 1 Hz inert controllers. Physics remains 60 Hz.
The source has passed in-Dolly physics and Chrome/Firefox checks; image 27 is
still served. New tasks are committed in `5764481`.

The current branch catalog has 91 placements in `020e1c1`: the original 70,
six red/blue rival and guard vehicles, two warehouse handlers, a quarry runner
and two cores, and two cargo-slinger crews with three light crates each. The
quarry roof is extended and the world sidebar has shortcuts to both batteries.
These are source changes; the owned preview still serves image 27.

The [thruster task](../tasks/20260925-035000-codex-01/TASK.md) has passed all-axis
force, blocked-nozzle, original-world migration/backup and Firefox builder
checks. Saved poses, keys, programs, memory and magnet attachments survive
conversion to physical opposing jets. Postbird, compact freighter mounts and
team-courier feedback now pass real delivery tests. The 1800 s combined repeat
retains 121 objects and makes 28 deliveries, including five heavy barge loads
and both quarry cores (`build/blockwalker-rivalry-compact-tuned42/`).

One remaining conversion regression affects Kawasemi (ID 50): its old program
circles its pickup. Its airframe matches the tuned team couriers. The same
feedback gains are prepared in `build/blockwalker-thrusters/kawasemi-tuned.js`,
with `kawasemi-delivery.json` (original gantry, courier and cargo) and
`kawasemi-replay.json` (source-only update for saved IDs 50/51). Test the isolated
handoff and a populated saved continuation before changing the canonical source.

The [warehouse program](../tasks/20260924-220500-codex-01/TASK.md) now separates
travel and alignment deadlines, returns empty trucks to staging and checks
clear diagonal routes around retained pallets. The saved 360 s repeat stores
five of six heavy loads and physically extracts East's next pallet from its
previous jam (`build/blockwalker-forklift-storage-diagonal/`). The new source
is in the catalog; uninterrupted multiple-load storage is still being checked.

The [cargo slinger](../tasks/20260925-032000-codex-01/TASK.md) uses normal 100 Nm
bearings, a braced mast, loading ram and magnetic tip. Its separate feeder loads
ordinary alloy crates. All aiming and handoff logic is editable program code.
The lost-target trial holds the same crate through 127 sampled seconds without
a target, then completes three reloads/shots; two hit the moving aircraft,
which recovers (`build/blockwalker-launcher-lost-target-ammo/`). A save/reopen
while holding the crate preserves it and resumes firing twice. A later load
slips and is recovered by the feeder; do not claim perfect shot reliability
(`build/blockwalker-launcher-loaded-reopen/`). Existing bearings suffice for this
prototype; the [rope/winch task](../tasks/20260925-041500-codex-01/TASK.md) remains
an optional separate investigation.

At 05:35 JST the fresh 2400 s `checkpoint42` run is active (exec session `61327`,
scope `run-rcfa122fc634646d1b50051d2c61ff430.scope`). Do not start another browser
until it exits. Its log is `build/blockwalker-checkpoint42.log`; evidence goes
to `build/blockwalker-rivalry-checkpoint42/`. It uses canonical source `020e1c1`
in `build/blockwalker-checkpoint-candidate-source.tar`, with seed 42. Every step
checks zero removals/controller errors; final storage requires at least two
distinct supported, unheld heavy pallets clear of each team's receiving pad.
World state downloads before trace chunks and the final assertion. Analyze it
with `build/blockwalker-combined-report.py`.

After this run: verify and promote Kawasemi's program if successful; repeat
Chrome's one-key builder test, both browsers' camera/source workflow and the
crowded Firefox warm render on the final saved world. The prior 103-object warm
Firefox result was 42.70 FPS; it predates the extra jet bodies and batteries and
does not prove current performance. Keep the performance issue open until measured.
Package once with `node scripts/prepare-blockwalker.mjs` and `npm run image --
blockwalker`, restart only the owned preview, and check original files plus all
12 other catalog entries with `build/blockwalker-checkpoint-preservation.mjs`.
Do not push or deploy.

The September 24 [playground checkpoint](../tasks/20260923-213000-codex-01/TASK.md)
records the packaged image, source revision and measured limits. Its
[island competition](../tasks/20260924-074500-codex-01/TASK.md) adds
industrial terrain, team scouts, replenished cargo, cranes and boats. Keep the
working walkers. The Lua/YAML migration is a separate task.
Long-run fixes and their evidence are in the [loading quay](../tasks/20260924-132300-codex-01/TASK.md),
[Amberguard navigation](../tasks/20260924-132700-codex-01/TASK.md),
[continuous freight/supplies](../tasks/20260924-144000-codex-01/TASK.md),
[lookout traffic](../tasks/20260924-145000-codex-01/TASK.md),
[Marrowstep recovery](../tasks/20260924-162500-codex-01/TASK.md),
[Postbird deliveries](../tasks/20260924-162800-codex-01/TASK.md), and
[Mochi cargo avoidance](../tasks/20260924-170000-codex-01/TASK.md). Their issues
record saved failure states and verification; experimental controllers under
`build/` are not automatically the packaged catalog.

The owned preview is `http://127.0.0.1:9099/blockwalker/`, managed by user service
`dolly-blockwalker-preview-20260924.service`. The owned relay listens on 9010.
Recheck process ownership before stopping anything. New image routes start fresh;
saved worlds retain their map revision. Preserve the original named sessions,
`.cache/blockwalker-browser-20260915` and `build/blockwalker-recovery-20260923/`.
The complete native Pi history must not be truncated. Its save/restore evidence
and remaining same-tab refresh problem are in the
[large-session memory task](../tasks/20260923-200000-codex-01/TASK.md).

Compile C inside Dolly. Run one disposable browser at a time, with a 4 GiB,
no-swap limit covering its entire process tree:

```sh
systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 \
  timeout --signal=TERM --kill-after=5s 480s \
  xvfb-run -a node test/blockwalker-browser.mjs
```

Use a suitable timeout for long physical trials. Scripts under the symlinked
`build/` directory need Node's `--preserve-symlinks-main`. Upload USTAR archives.
Do not request terminal screenshots while the game owns the GPU display.

Never deep-assert large binary buffers: Node's failed PNG diff previously
exhausted memory. Use `assert.ok(actual.equals(expected))`. Animated water makes
whole-frame equality unsuitable for camera checks; inspect actual camera poses.
The original desktop-freeze attribution remains an inference, not an established
GPU-driver fault. The [closed crash issue](../tasks/20260915-004300-codex-01/TASK.md)
records the reproduction; archives remain in `/home/daug/.cache/dolly-crash-20260915/`.
