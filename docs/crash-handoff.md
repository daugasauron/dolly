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

The [one-way thruster change](../tasks/20260925-035000-codex-01/TASK.md) is in
commits `a20925f` and `5502cd8`. Physics and Firefox builder checks pass. Import/startup migration
preserves all 51 original creatures, 78 programs, original poses/velocities,
memory and magnets; it backs up the version-1 world before upgrading to version
2. Old reverse keys get real opposing jets. Blocked engines get clear mounts.
Equal-distance mount choices now preserve radial symmetry. The original
recovery files remain untouched. Postbird
now uses a geometry-derived motor mixer and retuned attitude feedback. Its
180 s trial completes a real delivery at 29.883 s. The canonical 70 designs
now contain the converted jets and this program. A fresh 1800 s run then found
two transport regressions: wider engines blocked the freighter's berth and
team couriers circled without settling. Freighter mounts now fit their original
footprint, and ordinary courier attitude feedback is retuned. Both receiving
berths and a complete aerial delivery pass isolated tests. The delayed recovery
fixture also passes with actual opposing jets. The 21 new crew/battery placements
remain candidate-only. Current candidate source is
`build/blockwalker-teams-tuned-source.tar`, with catalog
`build/blockwalker-thrusters/catalog91-flight-tune.json`.

The [cargo launcher](../tasks/20260925-032000-codex-01/TASK.md) now completes
three real crane reloads and deliberate shots in 240 s. Two hit a moving
opposing aircraft, which recovers; this is not a demonstrated shootdown.
`build/blockwalker-launcher-safe-spin/` records the contacts and full state.
The editable program limits spin from magnet strength, mass and arm radius.
No C launch impulse was added; nearby sensors now include vertical velocity.
Sources in `build/blockwalker-launcher/` are experimental. The rendered Firefox
trial passes. The first populated 1800 s world records a shot contacting aircraft
8, but also reveals unwanted releases when a target leaves sensor range.
`retain-ammo.js` is an untested program candidate for holding that load instead.
Save/reopen and final combined-world checks remain. The existing bearing supports
the braced arm; a rope/winch has its own open task, `20260925-041500-codex-01`.

The [receiving-yard task](../tasks/20260924-220500-codex-01/TASK.md) still blocks
content promotion. Its fresh 1800 s test stored only one East and two West
pallets. The 1200 s replay recovered the world but gzip could not compress the
trace; the new harness splits traces into 300 s files and downloads the world
first. `route-arrival.js` fixes the blocked rounded BFS destination beside the
East landing pad. A saved 180 s continuation stores all three delivered loads
on actual support, clear of the depots. Fresh multiple-load proof is pending.
Use `build/blockwalker-rivalry/arrival-crew.json`, not older route variants.
The first one-way-engine world saved successfully at 1800 s but failed the
multiple-storage assertion because freight never left the loading quay. Its
evidence is `build/blockwalker-rivalry-one-way-teams42/`. The revised full-world
run uses label `compact-tuned42`; its output is
`build/blockwalker-rivalry-compact-tuned42/`.

At 04:50 JST the owned 1800 s run is still active (exec session `17955`, scope
`run-r46b1353cbbde44fea77be5a7973db9bd.scope`), with 840 s elapsed, 108 objects
and 15 deliveries. Do not start another browser until it exits. Its log is
`build/blockwalker-compact-tuned42.log`; the saved state downloads before the
final assertion. Analyze it with `build/blockwalker-combined-report.py`.
Next, test `build/blockwalker-launcher/intermittent-target.json` using the
sparse `blockwalker-courier-trial-browser.mjs` harness for 360 s. Then repeat
Chrome's one-key UI, both browsers' world camera/source workflow, and the
crowded Firefox warm render. Current UI edits are uncommitted and require a
new source archive. Promote proven crew/roof/programs, package once, restart
only the owned preview, and verify the protected files and other image entries.

The candidate crew adds six competing lifter/guard robots, two warehouse
handlers, and the [quarry runner](../tasks/20260925-012600-codex-01/TASK.md) with
two authored heavy cores. Both quarry runner/courier handoffs succeed in a
1200 s combined run; guards and lifters physically tip and right machines.
The candidate roof is `build/blockwalker-terrace/terrain.c`. The 90 s warm
Firefox check with 103 bodies measures 42.70 FPS and real-time simulation;
`build/blockwalker-rivalry-view-firefox-crowded-fresh1200/` has images and
measurements. This predates extra thruster bodies: repeat the crowded check
before closing the [performance task](../tasks/20260925-010000-codex-01/TASK.md).

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
