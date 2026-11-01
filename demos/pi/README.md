# Pi

The Pi coding agent as npm publishes it, running under QuickJS-ng and Janis
([JavaScript](../javascript/README.md)) as an ordinary private process over
Dolly's files, processes and HTTP broker.

## Images

- `pi`: `pi`, the Pi coding agent as npm publishes it, with the `janis-install`, `ripgrep` and `fd` packages.
- `pi-dolly`: Pi's Dolly extension: the prompt, the `dolly` skill, Slop for its shell tool, a download tool, `ask_user` and `show_html`, settings, theme and `pi-key`, with the `pi`, `secretenv`, `html` and `dolly-docs` packages.
- `pi-agent`: Pi coding agent with JavaScript, shell tools, ripgrep and fd.
- `pi-minimal`: Pi with a shell, POSIX tools and curl, on `display@0`, `input@0`, `download@0` and `html@0` alone: the README's "Pi with npm".
- `pi-runtime`: Reusable Pi and Janis runtime.

Open `/pi-agent/`; build with `npm run image -- pi-agent`. Leave Pi with
`/exit` or Ctrl+D. In another image, `amy install pi-dolly` brings the agent
as pi-agent has it, `amy install pi` Pi alone.

## How it works

- `pi` installs `@earendil-works/pi-coding-agent` with `janis-install` from a
  copy of the registry files of the tree `package-lock.json` pins
  ([`prepare-pi-npm.mjs`](prepare-pi-npm.mjs)), so images open offline; the
  `pi` command ([`pi.c`](pi.c)) runs its `dist/cli.js`. The `pi-dolly` package
  adds the prompt, skill, settings, theme and extension, and `pi-runtime`
  installs it.
- API keys: Pi's `/login` shows a key as it is typed. `pi-key VARIABLE`
  (`pi-key OPENROUTER_API_KEY`) reads one without showing it and starts Pi with
  it in that environment variable only, as the Claude Code launcher does.
- [`dolly-tools.js`](dolly-tools.js) plugs Slop into Pi's `bash` tool and `!`,
  keeps bytes that are not UTF-8 intact in edits and adds a `download` tool.
- [`ask-user.js`](ask-user.js) adds `ask_user`, which asks the user questions in
  an HTML form, and `show_html`, which shows an HTML document such as a report;
  both run the `html` command (`html@0`), whose popup the page draws in its own
  style.
- Conversations live in `~/.pi/agent/sessions` (`/resume`); credentials in
  `~/.pi/agent/auth.json`. Images never retain them; saved sessions do.
- [`settings.json`](settings.json) keeps Pi's regular TUI: fullscreen mode
  captures the mouse, taking selection and copy from Dolly's terminal. It
  names no model: the provider's catalog changes under any default.
- `pi --offline` skips catalog and update traffic, not model requests.

## Key files

- [`Dollyfile-pi`](Dollyfile-pi), [`prepare-pi-npm.mjs`](prepare-pi-npm.mjs), [`pi.c`](pi.c): install and launcher.
- [`SYSTEM.md`](SYSTEM.md), [`settings.json`](settings.json),
  [`skills/dolly/SKILL.md`](skills/dolly/SKILL.md): the agent's Dolly guidance.
- Tests: [`test/`](test/).

## Limits

- Pi's `pi install npm:...` needs npm, which is not here, and native addons
  do not load; `janis-install` installs npm packages.
  Dependency-free JavaScript extensions work via `~/.pi/agent/extensions/`.
- Image resizing is off: Photon needs nested WebAssembly. Another agent
  directory needs `"images": {"autoResize": false}` in its `settings.json`, or
  Pi omits prompt images it cannot resize.
- The `codemode` tool fails: its QuickJS sandbox needs nested WebAssembly and
  worker threads.
- OAuth logins depend on the provider's CORS; there is no callback listener.
- No PTY: run `nvim` from Slop, not from Pi's shell tool.

Test: `npm run test:demos -- pi` ([`test/`](test/)).
