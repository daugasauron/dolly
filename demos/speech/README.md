# Speech

Speech to text from the browser's microphone, recognised inside Dolly:
[transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) and its ggml
compiled by Dolly's `cc`, reading the Moonshine Streaming Tiny model.

## Images

- `speech-build`: transcribe.cpp built with CMake, and `speech-to-text` linked against it.
- `speech-to-text`: Speak, and what the microphone hears is written as text. English.

Open `/speech-to-text/` and allow the microphone; build with
`npm run image -- speech-to-text`.

## Use

The image starts `speech-to-text`. Words appear while they are spoken: the
line is shown dim and the model revises it until 1.5 s of quiet end it. After
15 s without one a breath (0.3 s) ends the line, and at 30 s it ends anyway.
Ctrl+C leaves a shell, where `speech-to-text [MODEL.gguf]` listens again.

Nothing leaves the page: the sound goes from `microphone@0`
([audio](../../docs/audio.md#microphone)) to the model in Wasm memory.

## Key files

- [`speech-to-text.c`](speech-to-text.c): one thread reads the microphone and
  brings its 48 kHz down to the model's 16 kHz; the other finds speech by its
  level above the room's and gives the model what arrived while it answered
  (120 ms or more), so the text is as far behind the voice as one answer takes.
- [`Dollyfile-speech-build`](Dollyfile-speech-build): the engine's CPU backend
  with threads and Wasm SIMD.
- [`Dollyfile-speech-to-text`](Dollyfile-speech-to-text): the program, the
  50 MB weights and their licences over `system`.

## Limits

- English only; no punctuation beyond what the model writes, no timestamps.
- Four threads on the CPU, no GPU, busy most of the time someone speaks. A
  slower machine falls further behind the voice; one that cannot keep up loses
  sound once 30 s are waiting, and the program says how much.
- Why this engine and model, and what was measured:
  [task](../../tasks/20261010-181500-speech-to-text/TASK.md).

Test: `npm run test:demos -- speech` ([`test/`](test/)).
