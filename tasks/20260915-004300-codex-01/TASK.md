# Slopyard screenshot assertion can exhaust host memory

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: bug,browser,memory

The two host freezes on 2026-09-15 most likely came from Node's assertion
error formatter after a screenshot mismatch. The user forced both restarts.
The memory failure is reproduced; historical process memory was not recorded,
so attribution of the full-machine hangs remains an inference.

Evidence (JST):

- `xvfb-run -a node test/slopyard-browser.mjs` started at 00:00:34 and
  00:32:43, alongside a live Chrome scene. The first boot lost successful
  kubelet scrapes by 00:01:30 and ended at 00:27:41; the second ended at
  00:34:15. Neither recorded an OOM kill, kernel panic or NVIDIA Xid.
- The second test last wrote `build/slopyard-proof/world-camera.png` at
  00:33:07. Its next assertion compared entire PNG Buffers for equality after
  switching away from the world and back. Water now animates with `world.age`,
  making exact frame equality an invalid camera-preservation check.
- Node v22.22.2 expands Buffer values into one inspected line per byte, then
  retains an Int32Array copy at every Myers diff level. See the upstream
  [formatter](https://github.com/nodejs/node/blob/v22.22.2/lib/internal/assert/assertion_error.js)
  and [diff](https://github.com/nodejs/node/blob/v22.22.2/lib/internal/assert/myers_diff.js).
- A CPU-only comparison of two saved PNGs (362,376 and 310,869 bytes) was killed
  by its 256 MiB cgroup in 0.23 seconds, despite a 128 MiB V8 heap limit.
  The kernel confirmed `CONSTRAINT_MEMCG` for `pc-crash-assert-probe.scope`.
  This controlled OOM at 00:40:14 is separate from the earlier host freezes.
- `assert.ok(actual.equals(expected), message)` rejected the same inputs in
  0.235 ms; peak RSS was 46,976 KiB. No GPU was used in either probe.

Reproduction artifacts and original logs are preserved in
`/home/daug/.cache/dolly-crash-20260915/`. The PNG pair is an analogous failing
comparison, not the exact pair lost during either restart. Never run the
unsafe probe without its cgroup memory limit and timeout.

Mitigation: replaced screenshot Buffer deep assertions in
`test/slopyard-browser.mjs` with boolean Buffer equality assertions.
Syntax and diff checks pass; the equivalent failure path passed the bounded
CPU probe. The full browser test was not rerun during this investigation.

Completion: make camera-preservation checks account for animated water and
verify the browser test under an explicit process-tree memory limit. Preserve
the camera and input assertions; do not remove the behavior checks.

Verified 2026-09-15 00:50 JST: the editor test passed in 38 seconds under a
4 GiB process-tree cgroup limit, no swap, and a 180-second timeout. Observed
memory during the run was 1.41 GB (not a peak measurement). Chrome 151.0.7922.71
used the NVIDIA Blackwell adapter; no browser errors or ordinary-frame GPU
readbacks occurred. Log: `build/slopyard-water-editor-guarded.log`.

The uploaded userspace fixture wraps the real embedded frame loop and records
the existing C camera state, without adding a host capability or product hook.
Playwright still drives movement, switching views, held keys in the focused Pi
prompt, and Home. Assertions compare small camera records, independent of water
animation. Static screenshot checks retain bounded boolean Buffer comparisons.
Camera evidence: `build/slopyard-proof/camera.json`; full result:
`build/slopyard-proof/results.json`.
