# Pi shows a pasted API key in clear

- STATUS: CLOSED
- PRIORITY: 338
- TAGS: pi,security,studio

Reported by the recordings agent on the served candidate (`46a5776f`), in
`dollyfile-studio` and `pi`: `/login` → "Sign in with an API key" →
OpenRouter → paste a key shows the whole key on the "Enter OpenRouter API key"
line until Enter, and again as `> KEY` after Enter. The owner's Studio video
must show the paste masked, and a visitor's secret on a public demo screen is
wrong in any case.

## Reproduced (before the fix)

`demos/pi/test/pi-browser.mjs` with the masked-login check, against the
unpatched `pi` image in Chrome (`build/pi-mask-evidence/repro-unpatched.log`):
after typing the first 13 characters the screen shows

```text
 Enter OpenRouter API key
> sk-or-v1-QZXJ
```

## Route taken: a minimal patch to the pinned Pi source

1. Upstream does not do it. Pi 1.0.4 (npm `latest`, tag `7c10bd43`) and main
   (`28dcce2b`, 2026-10-05) have the same `login-dialog.ts` and pi-tui
   `Input` as 1.0.3: one plain `Input`, no mask, and `showAuthPrompt` sends
   every non-select prompt to `showPrompt`. No upgrade fixes it.
2. No extension hook exists. Login prompts from built-in and extension
   providers both go through `interaction.prompt` into the same
   `LoginDialogComponent`; extensions can replace the main editor, not that
   dialog or its input (`docs/extensions.md`, `docs/custom-provider.md`).
3. pi-ai already marks API-key prompts `{ type: "secret" }`
   (`ai/src/auth/types.ts`, `auth/helpers.ts`); only the TUI ignores it.
   [`demos/pi/pi-secret-input.patch`](../../demos/pi/pi-secret-input.patch),
   applied by `pi-build` to the pinned tag before compiling, adds an optional
   `mask` to pi-tui's `Input` (render and click mapping use one mask per
   grapheme; the value, editing, paste and undo are unchanged), has the login
   dialog set it for `secret` prompts and show the submitted line masked, and
   resets it for every other prompt. Recorded as a bootstrap exception in
   `demos/pi/README.md`.

## Upstream issue / pull request text

> **Login dialog shows API keys in clear**
>
> `/login` → API key: the key is rendered on the "Enter … API key" line while
> it is typed or pasted, and again as `> KEY` after Enter. pi-ai already
> types these prompts as `{ type: "secret" }`, but `showAuthPrompt` passes
> them to `LoginDialogComponent.showPrompt` like text prompts, and pi-tui's
> `Input` has no masked mode. Anyone screen-sharing or recording a login
> leaks the key.
>
> This adds `Input.mask` (a string shown once per grapheme in place of the
> value; editing, paste, undo and `getValue()` are unchanged) and
> `Input.getDisplayValue()`, and has the login dialog mask `secret` prompts,
> including the submitted line. OAuth codes, URLs and other text prompts are
> unaffected. Patch: `demos/pi/pi-secret-input.patch` in Dolly, against
> `v1.0.3`; it applies unchanged to `v1.0.4` and main.

## Done when

- No frame of the login shows the key, typed or bracket-pasted, before or
  after Enter; `auth.json` holds it; OAuth logins still show their codes.
  `demos/pi/test/pi-browser.mjs` asserts all three in Chrome.
- `npm run test:demos -- pi studio` and the source suite pass on rebuilt
  `pi` and `dollyfile-studio` images.

## Verified (2026-10-06)

Rebuilt with `DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=pi,dollyfile-studio`
through `build-slot.sh` (`pi-build`, `pi-coding-agent`, `pi-runtime`, `pi`,
`pi-local`, `dollyfile-studio`; the `patch` step applies cleanly in Dolly).
In Chrome:
- `npm run test:demos -- pi studio`: pass. `pi-browser.mjs` types 13
  characters of a fixture key, bracket-pastes the rest, presses Enter and
  checks every sampled screen from the first keystroke to "Saved API key"
  against every 4-character fragment of the key: none leaked; `auth.json`
  holds the whole key; the Codex OAuth code still shows in clear.
- `dollyfile-studio`: the same paste shows `> *****************************`
  (`build/pi-mask-evidence/studio-login-masked.png`).
- `npm run -s test:source`: 360 pass; `npm run lint:dollyfiles` passes.

The game images that install Pi (`bhop`, `classicube`, `rts-arena`,
`slopyard`) are repinned only; the integrator rebuilds them.
