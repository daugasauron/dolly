# Speech

Speech to text from the browser's microphone, recognised inside Dolly:
[transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) and its ggml
compiled by Dolly's `cc`, reading NVIDIA's Parakeet TDT-CTC 110M model. One
image writes what it hears; another puts speech and buttons a finger taps in
the place of a keyboard, for Pi on a phone.

## Images

- `transcribe`: the transcribe.cpp library and its ggml, built with CMake, which `speech-to-text` and `voice` link.
- `speech-to-text-mic`: Speak, and what the microphone hears is written as text. English.
- `pi-phone`: Pi for a phone: say what it should do, and tap buttons for the rest. English.
- `speech-to-text`: `speech-to-text` with the Parakeet model and Silero VAD, for an image that declares `microphone@0`.
- `voice`: `voice` with the Parakeet model, for an image that declares `microphone@0`, `touch@0` and `pty@0`.
- `parakeet`: NVIDIA's Parakeet TDT-CTC 110M speech model (English, 135 MB), which `speech-to-text` and `voice` read.

Open `/speech-to-text-mic/` or `/pi-phone/` and allow the microphone; build with
`npm run image -- pi-phone`.

The two images are a base and a package each. A recipe that declares the host
modules installs the same: `INSTALL` of `speech-to-text` or `voice`. `default`
declares neither `microphone@0` nor `touch@0`, so `amy install
speech-to-text` is refused there, naming the module; `parakeet` installs
anywhere.

## speech-to-text

The image starts `speech-to-text`. Words appear while they are spoken: the
line is shown dim and the model revises it until 1.5 s without speech end it.
After 15 s a breath (0.3 s) ends the line, and at 30 s it ends anyway. Ctrl+C
leaves a shell, where `speech-to-text [MODEL.gguf [DETECTOR.gguf]]` listens
again.

## pi-phone

`voice` runs Pi on a pseudo-terminal (`pty@0`) in all but the terminal's last
rows, draws its buttons there and takes their taps from `touch@0`
([input](../../docs/input.md#touch)), and types for the user into Pi's
terminal:

- **Speak** listens until Send, Done or Cancel; what was heard so far shows
  above the buttons, and Send or Done type it into Pi.
- **Menu** leads to Pi's model list (say part of a name, or use the arrows),
  the thinking level, a new chat, and the OpenRouter key: tap API key when Pi
  asks how to sign in, copy the key, tap the page's Paste, then Enter. The key
  goes to Pi's own `/login`, which keeps it in `~/.pi/agent/auth.json` in the
  session.
- The keyboard still types into Pi, and a paste reaches it as without voice.
- The microphone is open only while it listens.

[`pi.menu`](pi.menu) is the whole menu: each button is a label and the keys it
types. `voice MENU [MODEL.gguf] -- PROGRAM` runs any terminal program so.

Nothing that is said leaves the page: the sound goes from `microphone@0`
([audio](../../docs/audio.md#microphone)) to the model in Wasm memory. What Pi
is told goes to the model provider like anything typed.

## Key files

- [`hearing.h`](hearing.h): the microphone's 48 kHz brought down to the
  model's 16 kHz, and the line being spoken, which a second thread gives to
  the model again, whole, whenever the model is free.
- [`speech-to-text.c`](speech-to-text.c): Silero VAD tells speech from other
  sound, 32 ms at a time; a stretch of speech is a line.
- [`voice.c`](voice.c): the menu, the program on its pseudo-terminal, the
  buttons in the rows below it, taps and typing.
- [`Dollyfile-transcribe`](Dollyfile-transcribe): the engine's CPU backend
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
- `voice` types; it does not read what Pi shows. A button that types a
  command at the wrong moment types it into whatever Pi is showing, so no
  button types into a list Pi has yet to open.
- While voice has the fingers, a drag over Pi's rows scrolls nothing.
- Why this engine and model, and what was measured:
  [task](../../tasks/20261010-181500-speech-to-text/TASK.md).

Test: `npm run test:demos -- speech` ([`test/`](test/)).
