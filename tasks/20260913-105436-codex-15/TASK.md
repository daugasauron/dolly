# Separate image compatibility and seed identity from the kernel build hash

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: audit,core,build

## Evidence

At deployed main `ff633f7`, [write-build-id.mjs](../../scripts/write-build-id.mjs)
hashes the complete kernel Wasm plus dolly.data. [prune-stale-snapshots.mjs](https://github.com/daugasauron/dolly/blob/ff633f72f5f6c28439196d61fe573730c2739ed8/scripts/prune-stale-snapshots.mjs)
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

## Resolution

Image compatibility now hashes the compiler/sysroot seed, its file-map loader,
and the process, DSO, resident-plugin and snapshot contracts. The full runtime
ID additionally hashes the kernel. Image metadata, cache admission and
release verification use the image identity; saved sessions retain their strict
runtime identity. Kernel changes that alter image semantics still require a
contract version change. Recipe pins and exact artifact/loaded-Wasm checks remain.

The new Slop seed rebuilt all 18 selected images and their dependencies inside
Chrome. Their complete validated reuse plan takes 3.3 s. The selected artifacts
passed 28 checks in 3.78 s; the unselected CPython archive check is skipped.

To isolate kernel compatibility, a browser proof added a valid custom section
to the actual kernel binary, producing a different runtime ID with unchanged
seed/contracts. The original image bytes passed the full core gate in Chrome
(22.7 s) and Firefox (29.4 s), and pruning retained all nine default inputs.
This is a binary compatibility test, not a claim that arbitrary kernel semantic
changes are safe. Changed seed/loader/ABI bytes invalidate identity in the source
test; incompatible image metadata is rejected in both browsers, followed by a
successful fresh boot. A changed image identity prunes the incompatible closure.

Release packaging includes the contracts needed to recompute the image identity.
No browser network authority or process ABI was added.

The runtime build no longer deletes snapshots or scans image recipes. The old
automatic pruner was removed: the builder already validates selected outputs,
explains stale inputs and replaces completed artifacts; release and browser
admission still reject incompatible bytes. This also preserves rebuild reasons.
An actual unchanged official runtime rebuild produced identical runtime and
image identities and left all 188 recorded image/source digests unchanged.

An actual C implementation refactor subsequently moved the session delta parser
to a private shared header. The official kernel build changed the runtime from
`baf89648…` to `b050e090…`, preserving image identity `0ace6dd9…`, both compiler
binaries and the startup object. All 18 images were reused (3.7 s plan); Chrome
(22.3 s) and Firefox (28.5 s) passed the core gate against the new kernel. Normal
session save/export/import/restore and invalid-save cases also passed in Chrome.
