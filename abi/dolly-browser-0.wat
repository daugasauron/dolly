(module
  ;; The COMPLETE outer import contract. Review this file first. Ordinary
  ;; commands and resident plugins receive no browser objects or functions.
  ;; This is the current Emscripten bootstrap profile, not a stable libc ABI.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; The only Wasm-selected network edge. Null method means cancellation.
  ;; Implementation: src/dolly.c supplies spans; src/http-broker.mjs applies
  ;; src/http-policy.mjs BEFORE making the request. No other import loads URLs.
  (import "env" "dolly_http_dispatch"
    (func (param i64 i64 i64 i64 i64 i64 i64 i64 i32 i32) (result i32)))

  ;; Visible local-user output, not network access or host filesystem handles.
  (import "env" "dolly_bootstrap_write_bytes" (func (param i64 i64)))
  (import "env" "dolly_download_dispatch"
    (func (param i64 i64 i64 i64) (result i32)))
  (import "env" "emscripten_out" (func (param i64)))
  (import "env" "emscripten_err" (func (param i64)))

  ;; Time, entropy, startup environment, memory growth, and fatal termination.
  (import "wasi_snapshot_preview1" "environ_sizes_get"
    (func (param i64 i64) (result i32)))
  (import "wasi_snapshot_preview1" "environ_get"
    (func (param i64 i64) (result i32)))
  (import "wasi_snapshot_preview1" "clock_res_get"
    (func (param i32 i64) (result i32)))
  (import "wasi_snapshot_preview1" "clock_time_get"
    (func (param i32 i64 i64) (result i32)))
  (import "wasi_snapshot_preview1" "random_get"
    (func (param i64 i64) (result i32)))
  (import "env" "emscripten_date_now" (func (result f64)))
  (import "env" "emscripten_resize_heap" (func (param i64) (result i32)))
  (import "env" "_abort_js" (func))

  ;; Read-only copying from the fixed, already-loaded seed package. Indices
  ;; select package records; no guest path is resolved against a host resource.
  (import "env" "_wasmfs_get_preloaded_file_size" (func (param i32) (result i64)))
  (import "env" "_wasmfs_copy_preloaded_file_data" (func (param i32 i64)))
  (import "env" "_wasmfs_get_num_preloaded_files" (func (result i32)))
  (import "env" "_wasmfs_get_num_preloaded_dirs" (func (result i32)))
  (import "env" "_wasmfs_get_preloaded_parent_path" (func (param i32 i64)))
  (import "env" "_wasmfs_get_preloaded_child_path" (func (param i32 i64)))
  (import "env" "_wasmfs_get_preloaded_path_name" (func (param i32 i64)))
  (import "env" "_wasmfs_get_preloaded_file_mode" (func (param i32) (result i32)))

  ;; WasmFS device callbacks. The embedding installs only local byte-output
  ;; devices (runtime-worker.mjs: installOutputDevice), with EOF for reads.
  ;; Filesystem contents, metadata, paths, and descriptors remain in Wasm.
  (import "env" "_wasmfs_jsimpl_alloc_file" (func (param i64 i64)))
  (import "env" "_wasmfs_jsimpl_free_file" (func (param i64 i64)))
  (import "env" "_wasmfs_jsimpl_get_size" (func (param i64 i64) (result i32)))
  (import "env" "_wasmfs_jsimpl_read" (func (param i64 i64 i64 i64 i64) (result i32)))
  (import "env" "_wasmfs_jsimpl_write" (func (param i64 i64 i64 i64 i64) (result i32)))
  (import "env" "_wasmfs_jsimpl_set_size" (func (param i64 i64 i64) (result i32)))
)
