# Phone: Pi by buttons and speech

- STATUS: OPEN
- PRIORITY: 60
- TAGS: demo,speech,pi,phone,host-modules,owner

## State (2026-11-03): taken up again on the owner's phone

No longer parked: on 2026-11-03 the owner had pi-phone sign in to `claude-opus-5` on his phone,
its session saved and restored (529fb7c27), then reshaped it there: Pi's menu as an `html@0`
popup built from Pi (4cf7c7757); one bar of the page's buttons below the canvas, Speak, Send,
Clear, Menu and Paste, from `touch@0`'s BUTTONS (835fa963b, edaca025c); the page resized by the
phone's keyboard (5e31a9129); line and block characters that fill their cell (97d2d51bb, merged
from `core/display-fill` in 2c8839ab3, a seed change for the next full round). Sections below.

The list of 2026-10-13, checked: the stray reply is closed
(`tasks/20261010-234000-pi-stray-reply`); touch for programs is `touch@0`
(`tasks/20261013-144001-touch-module`, in v0.1.4); `buttons@0` is gone since 2026-10-23, and
whether the bar's buttons stay in `touch@0` is a line of `tasks/20261102-133353-owner-decisions`.
Done means 4's "`input@0` is unchanged" gave way on 2026-10-23: Paste is input@0's, fingers
`touch@0`'s.

Left:

- Hearing is slow on a phone (1.8 times as fast as speech against 29 on the desktop,
  2026-10-10): WebGPU for transcribe.cpp's ggml over `gpu@0`, more threads, the Wasm build's
  speed against the native one. Not taken up.
- Pi's own lists still want the arrow row: the menu cannot tell when one is open.
- Every open on the phone downloaded the 367 MiB image again (slopshare.dev/v0.1.4, about 4
  minutes); why the first load's copy was not kept is not measured.

## The request

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

## On the owner's phone again (2026-11-03, 07:55 to 08:25)

Owner: "pick up the pi-phone task now ... log in on pi with opus5 using claude API key on the
device and save that session." The same MD06P (Chrome 152), driven over USB with Chrome's
debugging socket and the page's `__dolly.input`; pi-phone from slopshare.dev/v0.1.4 (the public
page has no HTTP policy object, so Pi reaches api.anthropic.com directly).

- `/login anthropic`, "Sign in with an API key", the key from `~/.claude-api` typed as input and
  never printed (the reading script withholds any screen text holding six of its characters):
  "Saved API key for Anthropic"; `/model`, `claude-opus-5`, Ctrl+S: "Default model:
  anthropic/claude-opus-5". A turn answered ($0.023).
- Saved as `pi-opus5` (8,407 bytes, 38,723 uncompressed); the page moved to
  `/v0.1.4/session/?name=pi-opus5`. Reloaded: Pi restored on `claude-opus-5` without a login and
  answered "restored" ($0.022). The thinking level read "medium" after the restore, "off" before.
- The saved session holds the key (Pi's `auth.json`), in that Chrome profile for slopshare.dev;
  `/login` shows the key as it is typed (Pi's banner says so and names `pi-key`, which a save
  does not keep).
- Every open downloads the 367 MiB image again over the phone's connection (about 4 minutes on
  this one): the first load's copy was not kept.
- USB: the link dropped while a reload restored the session, the phone then failed to enumerate
  on port 1-3 (`device not accepting address, error -71`) and worked at once on port 1-2. During
  the work `stay_on_while_plugged_in` was 2 (USB), restored to the phone's 0 afterwards.

## One button and Pi's menu (2026-11-03)

Owner, after trying it on the phone: "I really dont like the buttons. I want there to be one
button to toggle the menu, and the menu should look a lot nicer and tie better in to how pi is
implemented, ideally you can convert the pi agents complete command/model into a "button menu"
somehow."

Branch `demo/phone-menu`:

- voice shows one button, **Menu**, which types F12 (`pi.menu`). Where Pi shows a list of its
  own, the row is Up, Down, Enter, Esc and Done.
- `demos/speech/phone-menu.js`, a Pi extension in pi-phone, takes F12 (`ctx.ui.onTerminalInput`)
  and shows Pi's menu with the html command (`html@0`), built from Pi each time it opens: the
  model (heading), provider, thinking level and context; the editor's draft; Speak, Send, Stop
  (while Pi runs), Clear, Arrow keys; **Model**: `modelRegistry.getAvailable()` by provider and,
  for OpenRouter's 435, by maker, set with `pi.setModel`; **Thinking**: `getSupportedThinkingLevels`
  of the model, set with `pi.setThinkingLevel`; **Commands**: Pi's built-in list (its own
  `dist/core/slash-commands.js`, which Pi does not export) and `pi.getCommands()` (extensions,
  skills, prompts), each with its description, run as typed; **Sign in**: every provider, Pi's
  own `/login`. Pi's built-ins the menu does itself or a phone cannot use are left out of
  Commands (model, thinking, login, quit, hotkeys, copy, share, bug, import).
- What a choice needs of voice goes on a pipe voice gives Pi at descriptor 3
  (`VOICE_CONTROL_FD`, `dolly_spawn_mapped`): `speak`, `type TEXT`, `page NAME`. Text Pi shows
  cannot ask for the microphone, as an escape sequence in its output could. `:word` (search
  by voice in Pi's model list) is gone with the list.
- `html@0`'s style: a `nav` of buttons is a grid of buttons a finger can hit (one column on a
  phone), `details` a list of sections. ask-user's `showHtml` is exported for the menu.
- The yellow screen on the phone was the driving script's: `visibleTerminalText`, the page
  handle's screen read, selects every cell (two tests copy that selection), and the script
  read the screen over USB without clearing it after.

Measured: `demos/speech/test/speech-browser.mjs` (pi-phone signs in to OpenRouter through the
menu, chooses a Claude model, thinking high, runs `/session`, speaks and sends) passed in
Chromium (25.3 s); `test/html-browser.mjs` and pi's `ask-user-browser.mjs` passed in Chromium
and Firefox. Screenshots: `build/phone-evidence/shots.mjs`.

Left: Pi's lists still want the arrow row, since the menu cannot tell when one is open.

## Menu and Paste from one source (2026-11-03)

Owner, on voice's drawn Menu beside the page's Paste: "I dont like how the buttons at the
button look. Also the paste button should be next to menu (I think 2 buttons is fine, Menu &
Paste). The height of the buttons is too much and I want some yellow border". A first attempt
drew Menu as a box of line characters and placed Paste beside it by the display's grid (CSS
variables, a reserved column count). The owner: "I don't want the source of the Menu and Paste
buttons to be different [...] Rethink it from first principles". Then approved a contract change.

- Paste must be the page's: only the page reads the clipboard, and only on the user's press of
  a control the page owns; a program that drew it could read the clipboard on any tap. So Menu is
  the page's too, drawn by the same code.
- `touch@0` gives the lease holder up to 12 labels (`dolly_touch_buttons`, op 95; the labels
  after the ring at byte 16400, a labels word the kernel adds one to after each change). The
  page shows them in input@0's bar below the canvas, before Paste, with Paste's look; a tap is a
  record of phase `PRESS` whose id is the index and x the labels word it was pressed under, and
  READ drops presses of replaced labels. The buttons go with the lease. The module stays `@0`
  (no module has been renumbered; the ABI digest refuses old clients).
- The terminal element is a column: the canvas takes what the bar leaves, and the display
  measures the canvas, not the element, so the bar never covers a row.
- voice gives the page its page's labels, or Send, Done and Cancel while it listens, and reads
  presses; it draws only its two caption rows (580 to 469 lines: no layout, no cell size, no tap
  mapping). The arrow row is ↑ ↓ Enter Esc Done.
- The display's line and block characters stop short of a row (Iosevka's full block is 1.25
  em, a row 1.32 times its ascent and descent, so vertical lines show gaps). Fixed on branch
  `core/display-fill` (drawn scaled to the cell, as Ghostty draws them); it rebuilds 161 of 193
  images, so it waits for the next full round.
- Signed out, Pi's menu says so and opens on Sign in (Pi's placeholder model, "unknown", is no
  provider's).
- On the owner's phone the keyboard is Traditional T9, whose strip ("[ Abc / en ]") lies over
  the page's bottom while the terminal has the focus, and Chrome kept the page's height under
  it. The terminal page's viewport resizes with the keyboard (`interactive-widget=
  resizes-content`): the bar sits above the strip (screenshot over USB, 14:30).
- Owner: "The buttons should be on the left, not right, and I also want a button to toggle
  voice capture. And one button to send/clear that input." The bar starts at the left: Speak,
  Send, Clear, Menu, Paste. Speak is Stop while voice listens; Stop types what was heard into
  Pi's editor, Send types it and Enter, Clear drops it; resting, Send is Enter and Clear's F11
  empties Pi's editor (phone-menu.js; the key goes on, so Pi draws the editor again). The
  menu's own Speak, Send and Clear, and voice's `speak` order, are gone.

## Parked (2026-10-10, 23:55)

Owner: "I think using the phone GPU for the speech to text would be a significant boost? And
most phones have some kind of GPU right? But I want to park this locally for now and focus on
the wine stuff."

Parked on local `main`, served from `work/rust/build/phone-release` on port 9008. To take up
again, in this order: whether the phone's Chrome has WebGPU and whether transcribe.cpp's ggml
has a backend for it over `gpu@0` (the engine's card gives its Vulkan build 1.5 times its CPU
build for this model on a laptop, so the gain on a phone is to be measured, not assumed); more
threads; why the Wasm build is a quarter of the native one's speed on the same processor; the
stray reply in Pi's prompt; the owner's verdict on `buttons@0` once tried at length.
