# A phone image: Pi driven by buttons and speech, no keyboard

- STATUS: OPEN
- PRIORITY: 200
- TAGS: demo,speech,pi,phone,host

Owner (2026-10-10), after trying `speech-to-text`: "The model for speech to text is okay but it
misinterprets a lot of things. Are there better models or like tuning available?" and then:

"I really like this setup. I want to create an image that is phone friendly (chrome on android)
that launches pi agent with this speech to text thing, and where its possible to easily login
with openrouter as the provider and also select/search model, thinking level etc. There should
be no keyboard input, just a "button" menu and speech to text. API keys need to be pasteable.
I think the phone input stuff requires it's own host bridge to be nice? separate from the
"normal" input module. Need to find a good balance between image size and
performance/accuracy of the text to speech."

Done means:

1. An image that opens on Chrome for Android into Pi, usable with touch alone: speak a prompt,
   send it, stop a run, answer Pi's selectors.
2. OpenRouter login by pasting a key from the phone's clipboard; the key is in no file of the
   repository, image, log or screenshot.
3. Model search and selection, and the thinking level, without a keyboard.
4. The phone's input crosses its own host module with a contract, a row in
   `docs/browser-boundary.md` and tests of its boundary; `input@0` is unchanged.
5. The speech model chosen from measurements: size, accuracy, and whether it keeps up.
6. Verified in Chrome with a phone's viewport and touch; what only a real phone can show is
   listed for the owner.

## Core: buttons@0

Commits `7a6daada` (contract and kernel), `870b6ab4` (terminal font), `c6fed63f` (page side,
touch scroll, tests). Image inputs after the contract: `sha256:a7ee26c5…b8fd20`.

Built as designed, with these differences:

- Two process operations, not one: 131 carries packets to the page, 132 is typing and has no
  path to the import.
- A layout's number changes with its buttons, not with every SHOW. A program that rewrites its
  caption while it listens would otherwise make every press stale, and rebuilt buttons lose a
  press that is in progress.
- The wire wants a PASTE button's label zero; `dolly_buttons_show` sends zero whatever the
  program wrote there.
- Typed bytes keep their place among keyboard records exactly (a marker per unread record in
  the kernel's queue), and are dropped with other unread input when the foreground program
  ends or an input lease is released.
- A typed Ctrl+C is the key's: SIGINT goes to the foreground tree. A holder started by the
  foreground shell is in that tree and gets it too, unless it handles SIGINT.
- `src/ghostty/display.c` is a source of `ghostty-build`, so the font rule re-pins every
  recipe; the documents are pinned by `Dollyfile-dolly-docs`, which Pi's recipes install.
- After Ctrl+= or Ctrl+- the chosen size is kept across resizes, on a narrow surface too.
- A caption longer than four lines shows its last four.

Measured in Chrome's Pixel 7 emulation (412x839 CSS pixels, scale 2.625, touch), by
`node test/buttons-browser.mjs`: font 19 px, 48x32 without a strip, 48x29 with a caption and
four buttons, 48x24 with twelve; at 360x740 font 16 px and 48x30 with four. 20 px gives fewer
than 48 columns there (the test steps one size up and counts).

Evidence, 2026-10-10: `node --test 'test/*.test.mjs'` 344 of 344; `buttons-browser`,
`terminal-browser`, `microphone-browser` and `sockets-browser` pass in Chrome and Firefox;
`node --test test/dolly.artifacts.mjs` 17 of 17 on the eleven images rebuilt (`system`,
`audio-sdk`, `dolly-docs` and what they are built from).

Not shown by emulation, for a real phone:

- Chrome for Android's clipboard prompt on the first Paste, and what a denial leaves behind.
- That `inputmode="none"` keeps the on-screen keyboard down on a tap, with the phone's own
  keyboard app.
- The strip against the gesture bar and Chrome's moving address bar; `env(safe-area-inset-bottom)`
  is zero unless the page's viewport asks for `viewport-fit=cover`, which it does not.
- A drag's feel (there is no inertia) and that no drag reloads the page: the terminal and the
  strip take no browser panning, the page's small indicators still do.
- Headless Firefox cannot refuse a clipboard read (its prompt is never answered), so that
  refusal is the test's own; Chrome's is the browser's.

## Demo: voice and the pi-phone image

Decided by the integrator (2026-10-10):

- Pi is not changed and keeps the terminal. `voice` (`demos/speech/voice.c`) runs beside it,
  holds `buttons@0`, and types: a button's keys, a paste, or what the microphone heard. Pi's own
  `/login openrouter`, `/model` and `/thinking` do the rest; `demos/speech/pi.menu` is the whole
  menu as labels and keys. Pi has no pseudo-terminal to be driven through, and its RPC mode would
  have meant another front end than Pi's.
- Speech is one utterance at a time, begun and ended by buttons (Speak, then Send, Done or
  Cancel); nothing guesses where speech ends. The text so far is the strip's caption, and is
  typed when the utterance ends. The microphone is open only meanwhile.
- A search word (`:word`, for the model list) is typed in small letters without the model's
  punctuation: "Sonnet." does not filter a list of names.
- A PASTE button types the clipboard, then the button's keys (Enter). The key goes through Pi's
  masked prompt into `~/.pi/agent/auth.json` in the session, nowhere else.
- `voice` ignores SIGINT: a typed or pressed Ctrl+C reaches every program the foreground shell
  started.
- The speech model and why: [speech task](../20261010-181500-speech-to-text/TASK.md).

Studied first in the released `pi` image at 48 columns (Pi 1.0.3): `/login openrouter`, Down,
Enter, the key, Enter ends in "Saved API key for OpenRouter" and OpenRouter's default model;
`/model` filters as one types (116 OpenRouter models ship with Pi); Shift+Tab and `/thinking`
change the level.

Run before the images existed, in a 412x839 touch session on `cmake-build` with `buttons@0`,
`microphone@0` and `threads@0` (programs compiled there with the image's flags):

- `voice` with the menu: seven buttons in two rows, the strip 160 px high, `inputmode="none"`;
  Speak, the sample sentence in the caption while Chrome's fake microphone played it, Done, the
  sentence typed at the shell's prompt, the microphone closed with no live track.
- Menu, OpenRouter key, Paste: the page's own Paste button, the made-up key typed with Enter.
- `speech-to-text` on the new model and detector: the sample's sentence whole, line after line.

## The owner on the module's shape (2026-10-10, 22:00)

"Explain the buttons module? It sounds strange to me, I was thinking more of "phone input"
handling input from the touch screen, like dragging zooming etc. Buttons is sort of irrelevant
for that?"

Answered: `buttons@0` is the keyboard's replacement (a strip the page draws for one program, a
page-owned Paste, typing that stays in Wasm), not touch handling; touch reaches programs as
pointer input through `input@0`, with drag-to-scroll added in its page code. Open, the owner's
to decide: keep it, rename it (`keypad@0`), or have the terminal reserve rows for a second
program that gets the taps. Each of the last two changes the seed. Pinch to zoom was promised
for the terminal; touch points for programs (a `touch@0`) are not built.

Owner, after the answer: "Keep it as is for now, I want to try it before rejecting it."

## Result (2026-10-10, 22:40)

Branch `demo/pi-phone`; images `pi-phone` (392 MB snapshot: `pi-runtime` 253 MB, the speech
model 135 MB, `voice` 4 MB), `speech-to-text` (292 MB) and `speech-build`, built on the seed
with `buttons@0` (image inputs `a7ee26c5...`; the 23 images of their closure took 85 min, the
Rust chain most of it).

Verified, all in Chrome's Pixel 7 emulation (412x839, touch) unless said:

- `node demos/speech/test/speech-browser.mjs chromium`: "pi-phone: chromium passed in 20.4s".
  By taps alone: Menu, OpenRouter key, Paste (the clipboard's made-up key into Pi's masked
  prompt, "Saved API key for OpenRouter", the key on no screen); Menu, Model, Say (the sample's
  words typed into Pi's filter in small letters), Erase, Down, Choose; Menu, Thinking, Down,
  Choose; Speak, the caption growing, Send; the request to openrouter.ai (answered by the test)
  signed with the pasted key and holding the spoken sentence; Pi showing the answer; the
  microphone closed. `inputmode="none"` on the page's text field throughout.
- The same file's `speech` and `speech refused` pass in Chrome and Firefox on the new model.
- `node test/buttons-browser.mjs`: passes in Chrome and Firefox, with the pinch case added.
- The frozen copy served on port 9008 (`build/phone-release`, release `8dfc8ec8...`): buttons
  5.3 s after opening the page, the sample dictated into Pi's prompt.
- Found on the way: Pi ended at 48 columns ("Rendered line 3 exceeds terminal width (57 > 48)")
  on the Dolly header's line of keyboard hints; `demos/pi/dolly-tools.js` now cuts its header to
  the width. Every `pi` image had this on a terminal narrower than 57 columns.

Not verified, for the owner's phone:

- Everything a real phone decides: whether Chrome for Android keeps a 392 MB image and the
  model in memory, how long it takes to hear (this desktop: 0.36 s for 10 s of speech on four
  threads; a phone was not measured), its clipboard prompt, that no on-screen keyboard rises,
  the strip against the gesture bar, the feel of drag and pinch.
- The page's "Microphone on" and "Save" marks sit over Pi's last two rows while they show.
- A real OpenRouter key and a real answer: the test answers for openrouter.ai.

## On the owner's phone (2026-10-10, 23:00 to 23:40)

Owner: "I put a new openrouter key in ~/.openrouter. Use it to test in chrome on my phone thats
connected by usb". A Mode1 MD06P (Android 13, MT6769: two Cortex-A75 and six A55, 3.9 GB of
memory with 1.9 GB free, 360x640 CSS px at 2x, Chrome 152), reached with the owner's `adb`
(`adb reverse tcp:9008`, Chrome's debugging socket forwarded) and driven with touch events over
the debugging protocol. The key was read from the file into the phone's clipboard, never
printed, and the clipboard was overwritten afterwards; no log or screenshot holds it.

- Loads and runs: 374 MiB over USB and Pi up 9 s after the first open; 31 s on a reload, the
  speech model loaded at 45 s. 48 columns by 20 rows at 17 px with the seven buttons. The page
  took about 0.85 GB of the phone's memory.
- The key: the page's Paste button read the clipboard and Pi wrote "Saved API key for
  OpenRouter". The first menu typed Pi's login command and its answer to "how to sign in" 0.4 s
  apart (then 1.6 s): the list took 0.5 s to open once and longer another time, so the answer
  was typed into nothing. The key page now has an "API key" button the user taps when the list
  shows; no button types into a list Pi has yet to open.
- A real answer: the sample's sentence, typed by `voice` and sent, was answered by
  `moonshotai/kimi-k2.6` through OpenRouter ("That appears to be a variation of John F.
  Kennedy's famous inaugural address quote").
- Hearing, with the sample played into the page: "Listening." 0.4 s after the tap, the first
  words at 1.8 s, then 3 to 7 s behind the voice, more the longer the sentence (its end, spoken
  at 11 s, shown at 18.4 s). About 1.8 times as fast as speech for a whole pass, against 29
  times on this desktop.
- The real microphone: Chrome asked, the owner allowed, the state went from waiting to
  capturing in 8 s; the USB link then dropped. Owner: "I think it worked, but was very slow.
  Thats fine for now."
- The owner's first tap on Speak said "No microphone is available": that page still had the
  test's recording in place of `getUserMedia`, which played once.

Left open by the phone:

- Speed. The thread count is fixed at four because Dolly does not tell a program how many cores
  there are; on two fast and six slow cores, eight threads may halve the time (not measured).
  Hearing only the last seconds again for the caption, or the phone's GPU, are larger changes.
- After every load on the phone Pi's prompt holds "/d7d7", the end of the terminal's answer to
  Pi's colour question (`rgb:e8e8/e3e3/d7d7`): `tasks/20261010-234000-pi-stray-reply`. The
  menu's commands empty the prompt first, so they are not hurt; a first spoken prompt is.
- The USB link dropped three times in forty minutes; the port forwards go with it.
