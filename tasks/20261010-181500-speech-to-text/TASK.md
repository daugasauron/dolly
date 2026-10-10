# An image that boots into speech-to-text from the microphone

- STATUS: OPEN
- PRIORITY: 150
- TAGS: demo,speech,microphone

Owner (2026-10-10): "I want you to create a separate image that uses the microphone to do
speech-to-text. There must be some open source engines to do this (do research on the web and
find the best one in terms of performance/size). The image should just boot straight into
something that does speech-to-text using this, everything compiled inside the environment."
Later the same day: "I want the text to speech to be realtime" (read as: the text appears
while the words are spoken).

Result: `demos/speech/`, images `speech-build` and `speech-to-text` (branch `demo/speech`).
Open: the owner's own voice on a real microphone; everything below was run with a recording.

## Choice

Engine [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) at `c63b18e2`, model
Moonshine Streaming Tiny as its authors publish it for that engine (8-bit GGUF, 50.5 MB,
revision `f33fef62` of `handy-computer/moonshine-streaming-tiny-gguf`). Both MIT.

- The engine is C and C++ on the ggml it vendors, built by CMake, with a C API that takes sound
  as it arrives and returns the text so far. Nothing else is needed: no Python, ONNX Runtime,
  Kaldi or OpenFST, which the other engines looked at (sherpa-onnx, Vosk) would have had to be
  ported first. whisper.cpp builds as easily but its models take fixed 30 s windows.
- The model is made for streaming. Moonshine's own table (CPU only; latency is from the end of
  speech to the final text):

  | Model | Parameters | WER | Linux x86 | Raspberry Pi 5 |
  |---|---|---|---|---|
  | Moonshine Small Streaming | 123M | 7.84% | 165 ms | 527 ms |
  | Whisper Small | 244M | 8.59% | 3,425 ms | 10,397 ms |
  | Moonshine Tiny Streaming | 34M | 12.00% | 69 ms | 237 ms |
  | Whisper Tiny | 39M | 12.81% | 1,141 ms | 5,863 ms |

  The GGUF's card gives 4.52% WER on LibriSpeech test-clean for the 8-bit weights (4.53% for
  32-bit). English only.
- `speech-to-text MODEL.gguf` reads another model; Moonshine Small Streaming was not tried.

## Measured (Chrome, this machine, four threads)

- The engine's 162 files compile in the image build in about a minute (`make -j4`); both images
  build in 117 s. Snapshots: `speech-build` 243 MB, `speech-to-text` 205 MB (`system` is 151 MB).
- Wasm SIMD halves the model's time: 11 s of speech in 7.07 s without `-msimd128`, 3.79 s with.
- How far the screen is behind the voice, as the age of the oldest sound in each piece the model
  is given when its answer is shown (three passes of the 11 s sample, an instrumented copy):

  | The model is given | median | 90% | most | model busy |
  |---|---|---|---|---|
  | what arrived while it answered, 120 ms or more (shipped) | 223 ms | 321 ms | 634 ms | 75% |
  | the same, 240 ms or more | 376 ms | 453 ms | 659 ms | 57% |
  | 480 ms at a time (first version) | 613 ms | 697 ms | 704 ms | 31% |

  One answer costs about as much for 120 ms as for 480 ms and more as the line grows, which is
  why a line ends at a breath after 15 s.
- No sound was lost in 75 s of continuous speech once a second thread read the microphone.

## Found on the way

- ggml aligns its buffers to 16 bytes and Dolly's `malloc` to 8: the first image aborted in
  `ggml_init` where a session's build had run by luck. ggml has an 8-byte branch for Emscripten;
  the source preparation gives Dolly that branch, as `demos/local-llm` does for llama.cpp's ggml.
- An image that keeps a program must declare the host modules the program imports, so
  `speech-build` declares `microphone@0` and `threads@0`.

## Verified

- `node demos/speech/test/speech-browser.mjs chromium` and `firefox`: the image boots into the
  program, the sample's sentence grows on the line while it plays and ends as a finished line,
  Ctrl+C releases the microphone and leaves a shell; refused, the program says so. The sample is
  played through Web Audio in place of `getUserMedia`.
- Once with Chrome's fake capture device playing the same file, so through the real
  `getUserMedia` and the page's permission.

## The owner's verdict, and what was wrong (2026-10-10, evening)

Owner, after trying it with a Bluetooth headset: "The model for speech to text is okay but it
misinterprets a lot of things. Are there better models or like tuning available?" Both.

Two faults were the program's, found by running it natively on 3.5 minutes of the engine's
English samples (`samples/jfk`, `fleurs-en`, `dots`, `product-names`, `whole-earth`) against a
stand-in microphone that plays a file:

- The level that counted as "the room" kept adapting during a line, so quiet speech raised it
  until the rest of the sentence was taken for silence. `fleurs-en` (peaks of 0.008 to 0.015)
  came out as "Styles in the west could land." with any model; with the estimate held during a
  line Moonshine Small wrote the sentence whole. The fixed floor of 0.006 was also above much of
  that recording.
- A line cut at a pause started the model again with no context, and short pieces came out as
  "Yeah." or "You".

And the model: Moonshine Streaming Tiny's card gives 4.5% word error on LibriSpeech but 18.2% on
FLEURS. Candidates from the same engine's models, measured here (one 10.6 s utterance, four
threads; "Dolly" is Chrome on this desktop):

| Model | Size | LibriSpeech / FLEURS | Native, whole | Dolly, whole | Dolly, as a stream |
|---|---|---|---|---|---|
| Moonshine Streaming Tiny, 8-bit | 50 MB | 4.5% / 18.2% | 160x | 20-23x | 1.7x at 200 ms, 4.2x at 1 s |
| Moonshine Streaming Small, 8-bit | 199 MB | 2.5% / 8.6% | 28x | 3.0x | 0.2x at 200 ms, 0.7x at 1 s |
| Moonshine Streaming Medium, 8-bit | 296 MB | 2.2% / 7.9% | 26x | 3.0x | 0.9x at 1 s |
| Parakeet Unified EN 0.6B, 4-bit | 477 MB | 1.6% / 4.0% | 3.7x | 1.0x | 1.0x |
| Parakeet TDT-CTC 110M, 4-bit | 90 MB | 2.5% / 6.1% | 90x | 22-24x | not a streaming model |
| Parakeet TDT-CTC 110M, 8-bit | 135 MB | 2.4% / 6.1% | 117x | 29x (16x on two threads, 44x on eight) | not a streaming model |

- Wasm costs five to seven times native here. Moonshine's streaming decodes the whole line again
  at every feed (`min_decode_interval_ms`, 240 ms by default) and its encoder pays per feed, so
  as a stream Small and Medium do not keep up even on this desktop.
- Tiny in 16-bit floats is half as fast in Dolly as in 8 bits (11.6x), so quantized is the fast
  path in Wasm too.
- Chosen: Parakeet TDT-CTC 110M, 8-bit (NVIDIA, CC-BY-4.0; GGUF by transcribe.cpp's authors). It
  is as fast heard whole as Tiny, a third of Tiny's errors on FLEURS, and 85 MB more. It is not a
  streaming model, so a line is heard again from its start whenever the model is free: 0.36 s
  for 10 s of speech here. Speech is told from other sound by Silero VAD 6.2 (1.2 MB, MIT)
  through the same engine instead of by level.
