(module
  ;; Image boot contract. The browser may pack and persist system snapshots;
  ;; the runtime validates and restores the retained filesystem. This adds no
  ;; callable browser import and therefore no escape capability.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; A snapshot part: DOLLYSNP, its version and its record count (u32 each,
  ;; little-endian), then the records in path order, each a header of its
  ;; kind (u32), path length (u32) and data length (u64), its path and its
  ;; data. A directory's data is empty, a symbolic link's is its target. A
  ;; session's save uses the same kinds and adds deleted paths. The parts of an
  ;; image hold its paths once each, within the count and size given here; the
  ;; size bounds every file of an image too.
  (global (export "DOLLY_SNAPSHOT_VERSION") i32 (i32.const 2))
  (global (export "DOLLY_SNAPSHOT_HEADER_BYTES") i32 (i32.const 16))
  (global (export "DOLLY_SNAPSHOT_RECORD_HEADER_BYTES") i32 (i32.const 16))
  (global (export "DOLLY_SNAPSHOT_RECORD_DIRECTORY") i32 (i32.const 1))
  (global (export "DOLLY_SNAPSHOT_RECORD_FILE") i32 (i32.const 2))
  (global (export "DOLLY_SNAPSHOT_RECORD_SYMLINK") i32 (i32.const 3))
  (global (export "DOLLY_SNAPSHOT_RECORD_DELETED") i32 (i32.const 4))
  (global (export "DOLLY_SNAPSHOT_MAX_PATHS") i32 (i32.const 100000))
  ;; 2 GiB, in MiB: an i32 holds no 2^31.
  (global (export "DOLLY_SNAPSHOT_MAX_MEBIBYTES") i32 (i32.const 2048))
  (global (export "DOLLY_SNAPSHOT_PATH_MIN_BYTES") i32 (i32.const 2))
  (global (export "DOLLY_SNAPSHOT_PATH_MAX_BYTES") i32 (i32.const 4095))
  (global (export "DOLLY_SNAPSHOT_SYMLINK_MIN_BYTES") i32 (i32.const 1))
  (global (export "DOLLY_SNAPSHOT_SYMLINK_MAX_BYTES") i32 (i32.const 4095))

  ;; /etc/dolly/entry: DOLLYENT, its version and its argument count (u32
  ;; each), then each argument as its length (u32) and its UTF-8 bytes without
  ;; a NUL, the first an absolute path.
  (global (export "DOLLY_ENTRY_VERSION") i32 (i32.const 1))
  (global (export "DOLLY_ENTRY_HEADER_BYTES") i32 (i32.const 16))
  (global (export "DOLLY_ENTRY_MAX_ARGUMENTS") i32 (i32.const 256))
  (global (export "DOLLY_ENTRY_ARGUMENT_MAX_BYTES") i32 (i32.const 4096))
  (global (export "DOLLY_ENTRY_MAX_BYTES") i32 (i32.const 65536))

  ;; Allocate a bounded staging region in Wasm memory. The worker may only copy
  ;; the verified packaged snapshot into this checked region before asking Wasm
  ;; to restore it. A restore attempt consumes the staging allocation, including
  ;; on failure; the caller must allocate and copy again before retrying.
  (func (export "dolly_snapshot_restore_address") (param i64) (result i64)
    i64.const 0)
  (func (export "dolly_bootstrap_snapshot") (param i64) (result i32)
    i32.const 0)
  ;; Fresh boot streaming uses the same staging range, bounded by the caller.
  ;; Begin receives the canonical image size. Write consumes bytes; end_part=1
  ;; requires a complete sorted snapshot part. End requires every path of the
  ;; manifest and the image's size, and starts the display. The kernel hashes
  ;; nothing: the host checks each part against its pack's SHA-256 before it
  ;; ends the part. On failure discard the runtime: no command or saved
  ;; session may observe a partial filesystem.
  (func (export "dolly_bootstrap_snapshot_begin") (param i64) (result i32)
    i32.const 0)
  (func (export "dolly_snapshot_stream_write") (param i64 i32) (result i32)
    i32.const 0)
  (func (export "dolly_bootstrap_snapshot_end") (result i32)
    i32.const 0)
  (func (export "dolly_bootstrap_finish") (result i32)
    i32.const 0)
  ;; Loads /etc/dolly/environment once the filesystem is final: after the
  ;; image is restored and a saved session has replayed its files.
  (func (export "dolly_bootstrap_environment") (result i32)
    i32.const 0)
  ;; A root build: restore the staged compiler seed (dist/dolly.data, a
  ;; snapshot like any image) in full.
  (func (export "dolly_process_bootstrap_prepare") (param i64) (result i32)
    i32.const 0)
  ;; Restore only /bin/dollyfile from the staged base. That command's FROM
  ;; operation owns the full filesystem restore.
  (func (export "dolly_process_bootstrap_resume_prepare")
    (param i64) (result i32)
    i32.const 0)

  ;; The Worker stages fixed boot-control records in the in-Wasm filesystem.
  ;; This is a memory-to-WasmFS copy, not a browser filesystem capability.
  (func (export "dolly_write_file") (param i64 i64 i64) (result i32)
    i32.const 0)
  ;; A build's input images stay in the Worker, which numbers them from 0.
  ;; This makes a path (its parents are created) a file of the size given,
  ;; whose reads copy that input's bytes into kernel memory a window at a time
  ;; through env.dolly_build_input_read (dolly-browser-0.wat): the engine
  ;; restores an input without the kernel holding its snapshot. Truncating the
  ;; file shortens it; writing or growing it fails with EROFS.
  (func (export "dolly_build_input") (param i64 i32 i64) (result i32)
    i32.const 0)

  ;; A build asks Wasm to capture the retained files as one snapshot through
  ;; the staging range of dolly_snapshot_restore_address, which the Worker
  ;; sizes: begin lists them and returns the snapshot's size (0 fails); each
  ;; read fills the range with its next bytes and returns how many, 0 at the
  ;; end, which releases the capture and the range. A new begin replaces an
  ;; unfinished capture; finishing boot discards one.
  (func (export "dolly_snapshot_capture_begin") (result i64)
    i64.const 0)
  (func (export "dolly_snapshot_capture_read") (result i64)
    i64.const 0)
)
