# Installed packages stay in the image store: kernel memory and session saves hold what programs write

- STATUS: OPEN
- PRIORITY: 330
- TAGS: kernel,memory,sessions,packages,snapshots

Two findings of the night of 4 to 5 November, one cause:

- Lean in a 6 GB Firefox tab (`tasks/20261027-232422-lean`): after `amy install lean` the
  session's floor is 4.4 to 4.9 GB, 3.46 GB of it the package's files copied into the kernel's
  memory; compiling with `lean` adds about 1 GB and the tab is killed at `lake build`.
- A session holding `zig-llvm` and `cc` is 580 MB, so saving it fails ("exceeds its 512 MiB
  limit") (`tasks/20261103-102041-zig017`): the save holds the packages' files, which the image
  store already holds byte for byte.

An installed package's files are immutable distribution bytes until a program writes one.
AGENTS.md: mutable userspace state lives in Wasm memory, and "a browser cache may hold immutable
distribution bytes; it must not become the mutable guest filesystem". So the files of an installed
package (and of an image's inputs) can stay in the page's image store (`src/pack-store.mjs`, the
build Worker's pieces of `tasks/20261104-012434-install-copy`), read by the kernel a block at a
time, and become the kernel's own bytes when a program writes them (copy on write). A session save
then records the package by its digest, not its bytes; a restore reads them from the store again.

Decided by the integrator (2026-11-04, the Lean agent's proposal): yes, after 0.1.5, at high
priority. A contract and engine change (the file blocks' source, the session record of a package),
designed and measured on its own branch: the read path's latency per block, a write that copies
one file and not the package, a save and restore with packages, and a page without the store (a
private window) that still boots.

Done when: `amy install lean` adds under 0.2 GB to the kernel's memory and Lean's demo test
passes in a 6 GB tab in Chromium and Firefox; a session holding `zig-llvm` and `cc` saves and
restores, and its save holds no package bytes; `test/custom-session-browser.mjs`,
`test/session-offline-browser.mjs` and `test/image-browser.mjs` pass in both browsers.
