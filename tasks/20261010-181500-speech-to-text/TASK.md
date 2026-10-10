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
