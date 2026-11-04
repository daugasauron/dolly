(module
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_microphone_dispatch" (func (param i64 i64) (result i32)))
  (func (export "dolly_microphone_mailbox_address") (result i64) i64.const 0)
  (global (export "DOLLY_MICROPHONE_VERSION") i32 (i32.const 0))
  (global (export "DOLLY_MICROPHONE_PROCESS_OP") i32 (i32.const 130))
  (global (export "DOLLY_MICROPHONE_SLOTS") i32 (i32.const 1))
  (global (export "DOLLY_MICROPHONE_REPLY_BYTES") i32 (i32.const 16392))
  (global (export "DOLLY_MICROPHONE_PACKET_BYTES") i32 (i32.const 40))
  (global (export "DOLLY_MICROPHONE_RATE") i32 (i32.const 48000))
  (global (export "DOLLY_MICROPHONE_CHANNELS") i32 (i32.const 1))
  (global (export "DOLLY_MICROPHONE_MAX_FRAMES") i32 (i32.const 4096))
  (global (export "DOLLY_MICROPHONE_QUEUE_FRAMES") i32 (i32.const 96000))
  (global (export "DOLLY_MICROPHONE_OPEN") i32 (i32.const 1))
  (global (export "DOLLY_MICROPHONE_READ") i32 (i32.const 2))
  (global (export "DOLLY_MICROPHONE_STATUS") i32 (i32.const 3))
  (global (export "DOLLY_MICROPHONE_CLOSE") i32 (i32.const 4))
  (global (export "DOLLY_MICROPHONE_WAITING") i32 (i32.const 1))
  (global (export "DOLLY_MICROPHONE_CAPTURING") i32 (i32.const 2))
  (global (export "DOLLY_MICROPHONE_DENIED") i32 (i32.const 3))
  (global (export "DOLLY_MICROPHONE_UNAVAILABLE") i32 (i32.const 4))
  ;; A device leased per process: each call is a packet, a
  ;; dolly_device_header (runtime.h) and the body below, answered in a
  ;; reply slot of dolly-supervisor-0.wat. Sizes in brackets are of bodies.
  ;; One process holds the microphone at a time; a second OPEN fails EBUSY.
  ;; OPEN [0] reply [16]: u64 scope; u32 sample_rate,channels. It asks the
  ;; browser for its default audio input and returns at once: the browser's own
  ;; permission prompt decides, and the state says how far that has come.
  ;; READ [8]: u32 frames,reserved; frames is 1..4096. Reply [8+n*4]: u32 n,state;
  ;; then n mono f32 samples at 48 kHz, oldest first, 0 <= n <= frames. n is 0
  ;; while WAITING and whenever nothing is queued. DENIED fails EACCES and
  ;; UNAVAILABLE fails ENODEV once the queue is empty.
  ;; STATUS [0] reply [24]: u32 queued_frames,state; u64 captured_frames,
  ;; dropped_frames. The lease queues at most 96000 frames; when the program
  ;; reads too slowly the oldest are dropped and counted.
  ;; State: 1 WAITING for the browser's permission, 2 CAPTURING, 3 DENIED by the
  ;; user or the browser, 4 UNAVAILABLE (no input device, or it ended).
  ;; CLOSE [0] stops capture, releases the device and retires the lease; empty
  ;; reply. Reaping a process revokes its lease and stops capture the same way.
  ;; Capture is an explicit external device resource: mono PCM of the browser's
  ;; default input, only while a lease is open and the browser's permission
  ;; holds. It grants no device list or labels, no choice of device, no video,
  ;; no playback, no file, URL, DOM or network authority.
)
