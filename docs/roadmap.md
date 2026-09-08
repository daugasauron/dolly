# Direction

Dolly already builds conventional tools and runs Pi inside a browser's wasm64
userspace. The next work should make that system easier to understand, recover
and extend. Current bugs and evidence belong in the [audit handoff](audit-handoff.md),
not a second checklist here.

## Priorities

1. Finish lifecycle cleanup: interrupts must stop the intended command list,
   release resources and leave the shell usable.
2. Make existing workflows dependable: package installation, Studio authoring,
   save/load and clear failures when compatibility is missing.
3. Keep cold builds and shipped images small. Reuse explicit builder images;
   retain source pins, licenses and reproducible outputs.
4. Extend the substrate only for deliberately chosen behavior. Prefer a small,
   honest serial implementation to a broad API full of successful no-ops.

The API's shape is a user-led design decision. Operation profiling is not an
audit deliverable or a prerequisite for changing it.

## Candidate experiments

- **Studio panes:** real in-Wasm PTYs and local IPC, then source-built tmux with
  Pi and Neovim. No native process or browser socket fallback.
- **Portable custom images:** recipe plus exact base identity and saved filesystem
  changes, with explicit credential handling.
- **Rust tools:** establish an honest compiler-bootstrap boundary before shipping
  ripgrep, fd or a native agent port. Codex's isolated experiment is not a full agent.
- **Smaller builds:** independent cold-build reproducibility and narrower retained
  source/package sets, without removing licenses or required runtime resources.

For each change, keep exact ABI checks and a real-browser proof of the affected
workflow. Do not broaden browser authority merely to make a port pass.
