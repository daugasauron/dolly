# pi-local: say on Pi's start screen that /local exists

- STATUS: OPEN
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

The line is the extension's: `local-model-provider.js` notifies at
`session_start`, the mechanism dolly-tools.js uses, so the command and its
hint live in one file and both images show it on every session start
without a recipe edit; the Studio banner drops its copy. Not Pi's header
(dolly-tools owns it) and not a widget (the footer already carries the
model). Pi's header already says `/ commands`, so the line says nothing
about help or leaving. The local-model browser test waits for `/local` on
the screen at every boot, in both images and both browsers.

## Related

`20261006-093051-local-context-size` (the setting lives behind `/local`),
`20261005-215557-local-models`.
