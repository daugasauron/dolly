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
  ;; LE header [32]: u32 version,operation; u64 scope,sequence; u32 body,reserved.
  ;; Scope is a non-reused u32 lease; slot=(scope-1)%4. OPEN begins with scope=0;
  ;; the kernel binds its process-owned lease before dispatch. Sequence is a
  ;; nonzero, increasing u32; it must not wrap. Close/reopen before exhaustion.
  ;; Each process owns at most one lease. All reserved fields and upper u64 bits
  ;; are zero.
  ;; OPEN [32] reply [16]: u64 scope; u32 sample_rate,channels.
  ;; WRITE [40+frames*8]: u32 frames,reserved; interleaved stereo f32 PCM.
  ;; Frames are 128..4096 at 48 kHz. Nonfinite samples fail EINVAL; finite samples
  ;; are clamped to [-1,1]. Reply [4]: u32 accepted_frames. Admission is atomic;
  ;; EAGAIN means none accepted. Each lease queues at most 48000 frames/64 buffers.
  ;; STATUS [32] reply [16]: u32 queued_frames,state; u64 played_frames.
  ;; State: 1 running, 2 suspended (browser interaction may be needed to resume).
  ;; CLOSE [32] stops queued playback and retires the lease; empty reply.
  ;; Reaping a process revokes its lease, including pending requests/playback.
  ;; Dispatch(NULL,scope) is revocation. Other calls use copied bounded packets.
  ;; Reply mailbox: four 80-byte slots at a 64-byte-aligned base plus slot*80.
  ;; Five atomic u32 fields: state,scope,sequence,errno,length; 44 padding
  ;; bytes; 16 reply bytes. Provider publishes state=1 last, with release ordering.
  ;; PCM playback is an explicit external device resource. It grants no capture,
  ;; microphone, file, URL, DOM or network authority. Mixing/state remain in Wasm.
)
