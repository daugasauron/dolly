# The GPU provider reviewable: validation apart from execution

- STATUS: DONE
- PRIORITY: 150
- TAGS: gpu,security,maintainability,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, section 6 item 4). `AGENTS.md`: browser authority decisions are
"short and directly reviewable by a human".

## State (2026-11-13)

The split is in (`fix/audit-0.1.6`): each record's operation is one table entry, its layout (exact or
least bytes), whether it creates an object, a decode that reads its bytes into a record and checks what
the bytes alone decide, for every record of a batch before any runs, and a run that checks the record
against the scope's objects, quotas and open pass and makes the WebGPU calls. One statement a line;
1,609 lines (1,180 before, denser). The review's findings, fixed:
- A query set over the quota answered EINVAL; ENOMEM, as every allocation quota.
- Mapping a mapped buffer answered E2BIG (the mapping limit's errno); EINVAL.
- A compact draw or dispatch began its pass before resolving its handles, so a bad handle left a pass
  begun; handles resolve first.
- The surface texture of a batch was found in three places; `surfaceFrame`.
Passed: `test/gpu-render-browser.mjs` in Chrome 156 on the NVIDIA adapter (BC and uncompressed),
`gpu-explicit` in Chrome, `gpu-indicator`, `host-compute` in Chromium and Firefox (software WebGPU).
The installed Firefox does not start in a systemd unit here (launch timeout, as on 2026-11-01), so its
hardware runs are the Godot and PhotoCraft GPU tests. Left: those, and Xonotic's, in the round.

## State (2026-11-12)

Filed.

`host/gpu/worker.mjs` is the largest trusted provider (1,180 lines, 80 KB), written more densely
than the rest (several statements a line, 12 lines over 160 columns). Split validation (packet to
checked record) from execution (record to WebGPU call), one operation per function, and review it
line by line.

## Done when

The split is in, the GPU suites (`test/gpu-browser.mjs`, Godot, PhotoCraft) pass, and the review's
findings are fixed or filed.

## Closed (2026-11-13)

In the 0.1.6 candidate round (`work/round1113/build/round-1113c-evidence`), on the split provider: Godot's and PhotoCraft's GPU tests in
Chromium and Firefox, Xonotic's, local-llm, 0 A.D.'s graphics and slopyard on gpu@0, gpu-render and
gpu-explicit in Chrome (Firefox's installed snap does not start in a unit). The review's findings are
fixed above.
