# PCM sound interface

[`dolly-audio-0.wat`](../abi/dolly-audio-0.wat) defines process-call operation 129
and the exact `env.dolly_audio_dispatch(i64, i64) -> i32` browser import. Ordinary
programs use their existing `dolly_process_0.call` import; audio introduces no
additional process import or change to the base process ABI. Older kernels
return `ENOSYS`.

The v4 host module pairs [`src/host/audio.mjs`](../src/host/audio.mjs) with
`<dolly/audio.h>`. Images that play sound declare `REQUIRES HOST audio@0`;
the audio SDK and 0 A.D. recipes propagate this requirement. Linking the audio
client stamps `audio@0` into the executable; including its header alone does not.
The module depends only on `runtime@0`, creates the audio device on first use,
resumes it after trusted input, and closes playback on host disposal.

The interface plays interleaved stereo f32 PCM at 48 kHz. Decoding, mixing and
source buffers stay in Wasm. The browser owns copied, queued device output and
grants no microphone, capture, file, URL or network access. See the
[browser review map](browser-boundary.md#experimental-audio-provider) for the
provider and admission boundary.

Every request begins with a 32-byte little-endian header: u32 version and
operation, u64 scope and sequence, u32 body length and reserved zero. Scope and
sequence fit u32. A process owns at most one stream; four streams may coexist.
Leases are never reused and sequences increase without wrapping.

| Operation | Body | Successful reply |
| --- | --- | --- |
| OPEN (1) | Empty, scope zero | u64 scope, u32 rate (48000), u32 channels (2) |
| WRITE (2) | u32 frames, reserved zero, frames × 2 f32 samples | u32 accepted frames |
| STATUS (3) | Empty | u32 queued frames, u32 state, u64 played frames |
| CLOSE (4) | Empty | Empty |

Writes contain 128–4096 frames. Nonfinite samples fail with `EINVAL`; finite
samples are clamped to [-1, 1]. Each stream can queue at most 48000 frames and
64 buffers. Admission is atomic: a successful write accepts every frame and
`EAGAIN` accepts none. Request and PCM bytes are copied before acknowledgement;
the caller can reuse its buffer when the call returns. STATUS state is 1
(running) or 2 (suspended). Browser interaction may be needed to resume playback;
the guest cannot grant that interaction itself. OPEN before the first interaction
does not queue a blocked resume promise; a trusted interaction starts playback.

CLOSE stops queued playback. Normal exit, abort and forced process termination
also revoke the stream. A pending revocation keeps its host slot occupied until
acknowledged; fabricated Wasm mailbox completions cannot bypass admission.

## C SDK

[`Dollyfile-audio-sdk`](../Dollyfile-audio-sdk) compiles the C client inside Dolly
and installs `<dolly/audio.h>` and `libdolly-audio.a`. Its reusable
[`audio` module](../modules/audio.dm) requires the ordinary compiler, archiver
and process headers. The WAT generates `<dolly/audio-abi.h>` and the provider's
JavaScript constants.

```sh
npm run image -- audio-sdk
# In the audio-sdk shell:
cc player.c -ldolly-audio -o player
```

Zero-initialize a `dolly_audio` before its first open and use it serially. Open,
close and status return zero on success; write returns the accepted frame count.
All failures return -1 and set `errno`. Reopening an active client returns
`EBUSY` without losing its handle. The client validates reply sizes, negotiated
format, atomic writes and status limits. It reserves the last u32 sequence for
CLOSE: after `EOVERFLOW`, close and reopen before submitting more sound.

`node test/audio-browser.mjs` links a guest-compiled player against the installed
SDK. It checks stereo output, finite PCM, backpressure, accounting, exhaustion,
close/reopen, fresh processes and forced termination. A guest mock checks malformed
replies; a browser boundary probe checks copied packets, quotas, stale generations,
forged completions and bounded resume requests. Speakers are muted during testing.
Pass `firefox` to run the same checks in Firefox.
