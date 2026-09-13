# Separate image compatibility and seed identity from the kernel build hash

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,core,build

## Evidence

At deployed main `ff633f7`, [write-build-id.mjs](../../scripts/write-build-id.mjs)
hashes the complete kernel Wasm plus dolly.data. [prune-stale-snapshots.mjs](../../scripts/prune-stale-snapshots.mjs)
removes every snapshot whose runtime build ID differs. The image loader and
browser artifact cache also require that exact ID.

[The seed definition](../../toolchain/CMakeLists.txt) includes the compiler,
process sysroot, headers and bootstrap/Slop/Dollyfile sources.
[bootstrap.dm](../../modules/bootstrap.dm) explicitly relies on the runtime build
ID for inputs not individually pinned in its recipe. Consequently a kernel-only
implementation fix invalidates all 32 image slots, even if process and plugin
contracts did not change. This conclusion follows from the hash and admission
conditions; no kernel rebuild was performed for this audit.

This is a correctness dependency today, not a check that can simply be deleted.
Saved sessions also use the exact runtime identity; coordinate with
[workspace/config recovery](../20260913-092832-codex-10/TASK.md).

## Done when

- Make seed/compiler/sysroot identity explicit in image inputs.
- Define the compatibility conditions for reusing an image across kernel implementation changes, including process/plugin contracts and snapshot format/semantics.
- Keep recipe, artifact and loaded-Wasm validation; reject incompatible ABI, seed and snapshot changes.
- Prove a compatible kernel-only edit can reuse images, while a real seed/ABI change rebuilds the appropriate closure.
- Measure both cases and cover Chrome/Firefox admission and recovery with existing browser infrastructure.
