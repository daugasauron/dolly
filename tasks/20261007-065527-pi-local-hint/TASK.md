# pi-local: say on Pi's start screen that /local exists

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: pi,pi-local,local-llm,studio,agent-experience

Owner (2026-10-07): "Create a task to add some info in pi startup screen of
pi local that the user can run '/local' otherwise people (including me) won't
know it exists."

`/local` is where a person lists the local models, installs and switches
them, changes sampling, context size and output limit, and unloads a model
(`demos/local-llm/README.md`). Nothing on the screen a person first sees
names it.

## Work

- One line on Pi's start screen in `pi-local`, and in Dollyfile Studio, which
  ships the same provider: that `/local` chooses and configures the local
  model, beside what is already shown there (today the line under the prompt
  shows the model and context, e.g. "0.0%/16k (auto) … qwen3.5-2b").
- Find where the start screen's text comes from before choosing how: Pi's own
  header, the extension (`demos/local-llm/local-model-provider.js` can
  register a start message if Pi's extension API has one), the image's
  `.dollyrc`, or the page. Prefer what Pi offers extensions over patching Pi.
- The same line should say how to leave or get help only if Pi does not
  already.

## Done when

A person opening `/pi-local/` or `/dollyfile-studio/` reads, without typing
anything, that `/local` exists and what it is for; the local-model browser
test asserts the line.

## Decision (2026-10-07, `fix/visible` 87fdfe07)

Where the start screen comes from, seen on :9007 (`build/visible-evidence/
pi-local-start-9007-chromium.png` in `work/visible`): the image's
`.dollyrc` banner printed by Slop before Pi ("DOLLY / PI … Try: …"), then
Pi's header replaced by `demos/pi/dolly-tools.js` (`ctx.ui.setHeader`),
Pi's resource lists, dolly-tools' own start line (`ctx.ui.notify` at
`session_start`), the editor and Pi's footer with the model and context.
Dollyfile Studio's `.dollyrc` already named `/local`; `pi-local` inherits
`Dollyfile-pi`'s banner, which does not.

The line is the extension's: `local-model-provider.js` shows it at
`session_start`, so the command and its hint live in one file and both
images show it on every session start without a recipe edit; the Studio
banner drops its copy. Not Pi's header, which dolly-tools owns. Pi's
header already says `/ commands`, so the line says nothing about help or
leaving. The local-model browser test waits for `/local` on the screen at
every boot, in both images and both browsers.

First tried as `ctx.ui.notify(…, 'info')`, like dolly-tools' line: the
rebuilt `pi-local` showed it (`build/llm-proof/chromium-pi.png`) in place
of dolly-tools' "Dolly runs entirely in a browser Wasm sandbox … Bash is
not installed" line, because Pi's info notification is its one status
line (`showExtensionNotify` → `showStatus`), replaced by the next. So the
line is a widget above the editor (`ctx.ui.setWidget('local-model', …)`),
which leaves the status line to dolly-tools, and is removed at the first
prompt (`agent_start`) or when `/local` runs.

Dollyfile Studio, seen on the rebuilt image: its own extension
(`demos/studio/pi-extension.js`) notifies a four-line notice at start,
which in this round took the status line from dolly-tools' sandbox note
(yesterday's release on :9003 showed that note and the Studio's old
`.dollyrc` banner instead), and one of its lines already said "/local
installs and switches local models". With the widget that was two lines
about `/local`, so the Studio's line keeps only `/model` and the first
local prompt; the `/local` line is the provider's in both images.

## Closed (2026-10-07, `fix/visible` 6a96f4a9)

A person opening `/pi-local/` or `/dollyfile-studio/` reads the `/local`
line before typing, in Chromium and Firefox, and the local-model test
asserts it; verified as follows.

- GPU-less, headless Chromium on its software adapter, through
  `npm run test:demos -- local-llm` (the demo test's first part, before
  its DISPLAY skip): both images boot to the hint, `pi-local` beside the
  sandbox line, and `/local` takes the hint away without loading a model;
  screenshots `build/llm-proof/chromium-{pi-local,dollyfile-studio}-start.png`.
- Firefox cannot boot either image headless (no WebGPU adapter, so
  `gpu@0` is unavailable), so Firefox is asserted on the GPU display: the
  model test's `boot()` requires the hint (and the sandbox line in
  `pi-local`) at every boot and its absence after the first prompt, which
  passed in both images on 2026-10-07 08:36-08:52 (`local-llm.log`); the
  same assertions ran once more against the widget build with the
  installed Firefox on Xvfb :142
  (`local-llm-start-screen-firefox.log`, screenshots
  `build/llm-proof/firefox-{pi-local,dollyfile-studio}-start.png`).

## Related

`20261006-093051-local-context-size` (the setting lives behind `/local`),
`20261005-215557-local-models`.
