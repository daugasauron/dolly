# Pi's Dolly extension as its own amy package, pi-dolly

- STATUS: CLOSED
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

## Done (2026-10-23, branch `demo/opus-audit-2`)

`demos/pi/Dollyfile-pi-dolly` holds the five files (as `SOURCE` and `FILE` rows, moved from
`Dollyfile-pi`) and installs `pi` and `dolly-docs`: the extension imports Pi's own modules,
so `amy install pi-dolly` brings the agent as pi-agent has it, and `amy install pi` brings Pi
alone (its manual page says pi-dolly adds the rest). `pi-runtime` installs `pi-dolly`
instead of `pi`; `pi-agent` loses its own `dolly-docs` row, which pi-dolly brings. `bhop`
and `slopyard` install `pi-dolly` instead of `pi`, so they keep the same files (their game
agents pass `--no-extensions`, `--no-skills` and their own prompt, but Pi still reads
`settings.json`: `enableInstallTelemetry: false`, `shellPath`). `test/amy-browser.mjs`'s
`pi` row is now the `pi-dolly` row (Pi absent, then `pi --version`, `pi` in the record, the
prompt, the extension and a platform document in place). README lists the package.

Measured: `amy install pi-dolly` in `default` (`build/opus-evidence/r2/probe/probe4.*.out`,
probe.mjs), Chromium and Firefox: it installs quickjs, janis, ripgrep, fd, pi, dolly-docs
and pi-dolly (5 files, 22,364 bytes), and the row's check prints its OK. On the rebuilt
`pi`, `pi-dolly`, `pi-runtime` and `pi-agent`, `demos/pi/test/pi-browser.mjs` passes in
Chromium (63.2 s) and Firefox (65.2 s). Stale until the round: `bhop`, `slopyard`,
`classicube`, `rts-arena`, `pi-phone`, `pi-local`, `dollyfile-studio`.
