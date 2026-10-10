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
