(module
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_audio_dispatch" (func (param i64 i64) (result i32)))
  (func (export "dolly_audio_mailbox_address") (result i64) i64.const 0)
  (global (export "DOLLY_AUDIO_VERSION") i32 (i32.const 0))
  (global (export "DOLLY_AUDIO_PROCESS_OP") i32 (i32.const 129))
  (global (export "DOLLY_AUDIO_SLOTS") i32 (i32.const 4))
  (global (export "DOLLY_AUDIO_REPLY_BYTES") i32 (i32.const 16))
  (global (export "DOLLY_AUDIO_PACKET_BYTES") i32 (i32.const 32808))
  (global (export "DOLLY_AUDIO_RATE") i32 (i32.const 48000))
  (global (export "DOLLY_AUDIO_CHANNELS") i32 (i32.const 2))
  (global (export "DOLLY_AUDIO_MIN_FRAMES") i32 (i32.const 128))
  (global (export "DOLLY_AUDIO_MAX_FRAMES") i32 (i32.const 4096))
  (global (export "DOLLY_AUDIO_QUEUE_FRAMES") i32 (i32.const 48000))
  (global (export "DOLLY_AUDIO_MAX_BUFFERS") i32 (i32.const 64))
  (global (export "DOLLY_AUDIO_OPEN") i32 (i32.const 1))
  (global (export "DOLLY_AUDIO_WRITE") i32 (i32.const 2))
  (global (export "DOLLY_AUDIO_STATUS") i32 (i32.const 3))
  (global (export "DOLLY_AUDIO_CLOSE") i32 (i32.const 4))
  ;; A device leased per process: each call is a packet, a
  ;; dolly_device_header (runtime.h) and the body below, answered in a
  ;; reply slot of dolly-supervisor-0.wat. Sizes in brackets are of bodies.
  ;; Each process owns at most one lease, in slot (scope-1)%4.
  ;; OPEN [0] reply [16]: u64 scope; u32 sample_rate,channels.
  ;; WRITE [8+frames*8]: u32 frames,reserved; interleaved stereo f32 PCM.
  ;; Frames are 128..4096 at 48 kHz. Nonfinite samples fail EINVAL; finite samples
  ;; are clamped to [-1,1]. Reply [4]: u32 accepted_frames. Admission is atomic;
  ;; EAGAIN means none accepted. Each lease queues at most 48000 frames/64 buffers.
  ;; STATUS [0] reply [16]: u32 queued_frames,state; u64 played_frames.
  ;; State: 1 running, 2 suspended (browser interaction may be needed to resume).
  ;; CLOSE [0] stops queued playback and retires the lease; empty reply.
  ;; Reaping a process revokes its lease, including pending requests/playback.
  ;; PCM playback is an explicit external device resource. It grants no capture,
  ;; microphone, file, URL, DOM or network authority. Mixing/state remain in Wasm.
)
