# Pi's Dolly extension as its own amy package, pi-dolly

- STATUS: OPEN
- PRIORITY: 150
- TAGS: pi,packages,0.1.4

Owner (2026-10-23): "I also want teh pi extension for dolly (that includes system prompt,
extensions etc) to be a separate amy package."

Today the five files are rows of `pi` (`demos/pi/Dollyfile-pi:18-31`), installed under
`/home/dolly/.pi/agent/`, where Pi looks for them: `dolly-tools.js` (extensions/),
`SYSTEM.md`, `settings.json`, `dolly-theme.json` (themes/dolly.json) and the skill
(skills/dolly/SKILL.md). [The investigation](../20261023-114225-janis-install/investigation.md),
section 4, has where Pi reads each.

Done when: a package `pi-dolly` holds the five files and installs `dolly-docs` (the prompt and
the skill name `/usr/share/doc/dolly`); `pi` no longer carries them; `pi-runtime` installs
`pi-dolly`; `amy install pi-dolly` on `default` puts them in place (a row in
`test/amy-browser.mjs`); `demos/pi/test/pi-browser.mjs` passes in Chromium and Firefox. It
rebuilds `pi` and the images on it, in the v0.1.4 round.
