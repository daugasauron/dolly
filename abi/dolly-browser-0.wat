(module
  ;; The COMPLETE outer import contract. Review this file first. Ordinary
  ;; commands and resident plugins receive no browser objects or functions.
  ;; Each function is provided by the host module whose manifest owns its name
  ;; (host/NAME/module.json); addresses and sizes name kernel memory, and every
  ;; i32 result is zero or a negative error number of include/dolly/process.h.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; Bounded GPU device commands only; no URL, DOM selector or host pointer.
  (import "env" "dolly_gpu_dispatch" (func (param i64 i64) (result i32)))
  ;; Bounded stereo PCM playback; no recording, URL or browser object access.
  (import "env" "dolly_audio_dispatch" (func (param i64 i64) (result i32)))
  ;; Mono PCM of the browser's default input, behind the browser's own
  ;; permission prompt; no device list, playback, URL or browser object access.
  (import "env" "dolly_microphone_dispatch" (func (param i64 i64) (result i32)))
  ;; A caption and labelled buttons the page draws, their presses, and the
  ;; clipboard's text on a press of the page's own Paste button; no markup,
  ;; no key or pointer of the page, no URL or browser object access.
  (import "env" "dolly_buttons_dispatch" (func (param i64 i64) (result i32)))

  ;; The only Wasm-selected network edge. Null method means cancellation.
  ;; Implementation: host/http/kernel.c supplies spans; host/http/broker.mjs applies
  ;; host/http/policy.mjs BEFORE making the request. No other import loads URLs.
  (import "env" "dolly_http_dispatch"
    (func (param i64 i64 i64 i64 i64 i64 i64 i64 i32 i32) (result i32)))

  ;; Visible local-user output, not network access or host filesystem handles.
  ;; Boot text is at most 1 MiB a call (address, size); a longer write is refused.
  (import "env" "dolly_bootstrap_write_bytes" (func (param i64 i64) (result i32)))
  (import "env" "dolly_download_dispatch"
    (func (param i32 i64 i64) (result i32)))

  ;; Time in milliseconds: since the epoch, and since the runtime Worker started.
  (import "env" "dolly_clock_realtime" (func (result f64)))
  (import "env" "dolly_clock_monotonic" (func (result f64)))
  ;; Fills at most 65536 bytes (address, size) from the browser's generator.
  (import "env" "dolly_entropy" (func (param i64 i64) (result i32)))
)
