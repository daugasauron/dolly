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
