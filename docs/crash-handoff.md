# Host freeze handoff — 2026-09-15

Work in `/home/daug/dev/dolly/work/gpu-shaders`, on
`codex/blockwalker-retro-20260923`; the earlier `codex/blockwalker-20260914`
checkpoint remains preserved. The [retro reconciliation](../tasks/20260923-211500-codex-02/TASK.md)
records the current image and checks. Preserve the live world and full Pi conversation.
Current work, recovery archives and owned service processes are recorded in
[tasks/20260914-blockwalker-space-world/TASK.md](../tasks/20260914-blockwalker-space-world/TASK.md).
Recheck processes before stopping anything; other worktrees and previews belong
to other agents.

The two earlier desktop freezes most likely involved host RAM exhaustion while
Node 22 formatted a failed PNG assertion. That mechanism was reproduced, but
memory measurements from the original freezes were lost, so their attribution
remains an inference. No GPU driver or hardware fault was established.

Animated water made an identical-PNG camera assertion invalid. Passing those
large Buffers to `assert.deepEqual` triggered an enormous Myers diff; a bounded
CPU reproduction exhausted 256 MiB in 0.23 seconds. A V8 heap limit alone did not
contain these allocations. The boolean comparison failed normally in 0.235 ms
with 46,976 KiB peak RSS.

The fix is verified: binary comparisons use `assert.ok(actual.equals(expected))`,
and camera checks inspect actual C coordinates independently of animation.
The focused editor and physics/browser integration suites have passed repeatedly
under a 4 GiB/no-swap limit covering the complete test process tree. Keep this
command pattern, with only one test browser at a time:

```sh
systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 \
  timeout --signal=TERM --kill-after=5s 180s \
  xvfb-run -a node test/blockwalker-browser.mjs
```

This contains host memory usage, not GPU-driver faults. Never deep-assert large
binary data or rerun the unsafe OOM reproduction without a cgroup limit. The
closed [crash issue](../tasks/20260915-004300-codex-01/TASK.md) retains the timeline,
measurements and verification. Original artifacts remain in
`/home/daug/.cache/dolly-crash-20260915/`.
