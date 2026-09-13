# Keep shared mmap writeback within the file's bounds

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,bug,core,filesystem

No description.

## Evidence

Reproduced in fresh Chrome and Firefox sandboxes on the deployed default image at `ff633f7`:

1. Create a one-byte file containing `A` and open it with `O_RDWR`.
2. Map 4,096 bytes with `PROT_READ | PROT_WRITE, MAP_SHARED`.
3. Set the first mapped byte to `B`, then call `msync(mapping, 4096, MS_SYNC)`.
4. Inspect the file with `fstat`.

Dolly returns success and grows the file to 4,096 bytes. The native Linux control retains one byte containing `B`.
[`write_mapping`](../../src/process/mmap.c) writes the entire range, including zero-filled bytes beyond EOF.
The existing [mmap check](https://github.com/daugasauron/dolly/blob/ff633f72f5f6c28439196d61fe573730c2739ed8/src/process/mmap-check.c) maps only one byte.

## Done when

- Shared writeback does not extend a file merely because its mapping extends past EOF.
- Both `msync` and `munmap` preserve the supported file-length semantics.
- A browser regression covers this case and the existing descriptor-lifetime checks still pass.
- The supported shared-mapping behavior is documented explicitly; unsupported behavior does not silently succeed.

## Fix under verification

`write_mapping` now clips writes to the file length observed at writeback start.
The rebuilt system-build SDK passes mappings past EOF, truncation, closed-FD
writeback and the existing descriptor-lifetime probe in Chrome and Firefox.
The regression is in `test/fixtures/mmap-bounds.c` and the core browser gate.
The default-image rebuild is still pending.
