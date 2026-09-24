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
