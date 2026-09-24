# Blockwalker handoff

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. The earlier retro and September 14
checkpoint branches remain preserved. Do not modify the parent worktree or
other agents' previews.

The active [playground task](../tasks/20260923-213000-codex-01/TASK.md) runs through
September 24, 2026, 18:00 JST. The current content direction and latest measured
checkpoint are in the [island competition task](../tasks/20260924-074500-codex-01/TASK.md):
industrial terrain, team scouts, replenished cargo, cranes and boats. Keep the
working walkers. The Lua/YAML migration is a separate task.
Long-run follow-ups are the [loading quay](../tasks/20260924-132300-codex-01/TASK.md)
[Amberguard navigation](../tasks/20260924-132700-codex-01/TASK.md), and
[continuous freight/supplies](../tasks/20260924-144000-codex-01/TASK.md), and
[lookout traffic](../tasks/20260924-145000-codex-01/TASK.md). Their issues
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
