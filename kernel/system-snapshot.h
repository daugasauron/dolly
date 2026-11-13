#ifndef DOLLY_SYSTEM_SNAPSHOT_H
#define DOLLY_SYSTEM_SNAPSHOT_H

#include <stddef.h>
#include <stdint.h>

// The build packages this as an opaque blob. Paths, validation, and all
// filesystem operations remain owned by the Wasm runtime.
uintptr_t dolly_snapshot_restore_address(uintptr_t size);
// Validate the whole image; restore all paths or one regular file for bootstrap.
// Consumes the staging allocation on success or failure; restage before retrying.
int dolly_snapshot_restore_staged(uintptr_t size, const char *only_path);
// Fresh boot only. Begin consumes the expected SHA-256 from the staging range.
// Parts may arrive in any order; every manifest path must appear exactly once.
// Failure leaves a partial filesystem that must never be started or reused.
int dolly_snapshot_stream_begin(uintptr_t size);
int dolly_snapshot_stream_write(uintptr_t size, uint32_t end_part);
int dolly_snapshot_stream_finish(void);
// A capture streams the snapshot through the staging range: begin returns its
// size (0 fails), each read fills the range and returns how many bytes, 0 at
// the end. A new begin replaces an unfinished capture.
uintptr_t dolly_snapshot_capture_begin(void);
uintptr_t dolly_snapshot_capture_read(void);
uint32_t dolly_snapshot_format_version(void);

// Boot-only: discard an unfinished capture and unretained build inputs.
// Not a host export.
int dolly_snapshot_prune(void);

#endif
