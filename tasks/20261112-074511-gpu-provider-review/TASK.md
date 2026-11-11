# The GPU provider reviewable: validation apart from execution

- STATUS: OPEN
- PRIORITY: 150
- TAGS: gpu,security,maintainability,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, section 6 item 4). `AGENTS.md`: browser authority decisions are
"short and directly reviewable by a human".

## State (2026-11-12)

Filed.

`host/gpu/worker.mjs` is the largest trusted provider (1,180 lines, 80 KB), written more densely
than the rest (several statements a line, 12 lines over 160 columns). Split validation (packet to
checked record) from execution (record to WebGPU call), one operation per function, and review it
line by line.

## Done when

The split is in, the GPU suites (`test/gpu-browser.mjs`, Godot, PhotoCraft) pass, and the review's
findings are fixed or filed.
