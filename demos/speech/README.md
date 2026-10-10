# Speech

Speech to text from the browser's microphone, recognised inside Dolly:
[transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) and its ggml
compiled by Dolly's `cc`, reading NVIDIA's Parakeet TDT-CTC 110M model. One
image writes what it hears; another puts speech and on-screen buttons in the
place of a keyboard, for Pi on a phone.

## Images

- `speech-build`: transcribe.cpp built with CMake, and `speech-to-text` and `voice` linked against it.
- `speech-to-text`: Speak, and what the microphone hears is written as text. English.
- `pi-phone`: Pi for a phone: say what it should do, and tap buttons for the rest. English.

Open `/speech-to-text/` or `/pi-phone/` and allow the microphone; build with
`npm run image -- pi-phone`.

## speech-to-text

The image starts `speech-to-text`. Words appear while they are spoken: the
line is shown dim and the model revises it until 1.5 s without speech end it.
After 15 s a breath (0.3 s) ends the line, and at 30 s it ends anyway. Ctrl+C
leaves a shell, where `speech-to-text [MODEL.gguf [DETECTOR.gguf]]` listens
again.

## pi-phone

Pi runs in the terminal as in the `pi` image; `voice` runs beside it, holds
`buttons@0` ([input](../../docs/input.md)) and types for the user:

- **Speak** listens until Send, Done or Cancel; what was heard so far shows
  above the buttons, and Send or Done type it into Pi.
- **Menu** leads to Pi's model list (say part of a name, or use the arrows),
  the thinking level, a new chat, and the OpenRouter key: tap API key when Pi
  asks how to sign in, copy the key, tap Paste. The key goes to Pi's own
  `/login`, which keeps it in `~/.pi/agent/auth.json` in the session.
- The microphone is open only while it listens.

[`pi.menu`](pi.menu) is the whole menu: each button is a label and the keys it
types. `voice MENU [MODEL.gguf]` works beside any terminal program.

Nothing that is said leaves the page: the sound goes from `microphone@0`
([audio](../../docs/audio.md#microphone)) to the model in Wasm memory. What Pi
is told goes to the model provider like anything typed.

## Key files

- [`hearing.h`](hearing.h): the microphone's 48 kHz brought down to the
  model's 16 kHz, and the line being spoken, which a second thread gives to
  the model again, whole, whenever the model is free.
- [`speech-to-text.c`](speech-to-text.c): Silero VAD tells speech from other
  sound, 32 ms at a time; a stretch of speech is a line.
- [`voice.c`](voice.c): the menu, the buttons, and typing.
- [`Dollyfile-speech-build`](Dollyfile-speech-build): the engine's CPU backend
  with threads and Wasm SIMD.

## Limits

- English only; no timestamps.
- The model is not a streaming one: the longer a line, the longer each
  hearing of it takes, so the text falls further behind towards the end of a
  long line. Four threads on the CPU, no GPU.
- A phone hears slowly. On a Mode1 MD06P (Helio G80 class, 4 GB) the text
  was 3 to 7 s behind an 11 s sentence, further behind the longer it went;
  this desktop is 16 times faster. The image loaded and ran there in Chrome
  152 with 1.9 GB free.
- `voice` types; it cannot see the screen. A button that types a command at
  the wrong moment types it into whatever Pi is showing, so no button types
  into a list Pi has yet to open.
- Why this engine and model, and what was measured:
  [task](../../tasks/20261010-181500-speech-to-text/TASK.md).

Test: `npm run test:demos -- speech` ([`test/`](test/)).
