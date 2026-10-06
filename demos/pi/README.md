# Pi

The Pi coding agent, unforked, running under QuickJS-ng and Janis
([JavaScript](../javascript/README.md)) as an ordinary private process over
Dolly's files, processes and HTTP broker.

## Images

- `pi`: Pi coding agent with JavaScript, shell tools, ripgrep and fd.
- `pi-runtime`: Reusable Pi and JavaScript runtime.
- `pi-build`: Pi packages compiled from pinned TypeScript sources.
- `pi-coding-agent`: Pi with ripgrep and fd, as a package.

Open `/pi/`; build with `npm run image -- pi`. Leave Pi with `/exit` or Ctrl+D.

## How it works

- `pi-build` runs the official TypeScript compiler inside Dolly and emits Pi's
  workspace packages to `/usr/lib/node_modules` (`noCheck` emit, no type
  checking). `pi-runtime` adds the prompt, settings, theme and extension.
- Bootstrap exception: [`pi-secret-input.patch`](pi-secret-input.patch) makes
  the login dialog show `*` for prompts pi-ai marks `secret` (API keys);
  upstream 1.0.4 shows them in clear. Drop it when upstream masks them
  ([task](../../tasks/20261005-231730-pi-key-mask/TASK.md)).
- External packages are listed in [`pi-runtime-packages.txt`](pi-runtime-packages.txt)
  and verified against `package-lock.json`; `node demos/pi/pi-runtime-census.mjs` reports pins and
  licenses. They load from WasmFS, never from the network.
- [`dolly-tools.js`](dolly-tools.js) plugs Slop into Pi's `bash` tool and `!`,
  keeps bytes that are not UTF-8 intact in edits and adds a `download` tool.
- Conversations live in `~/.pi/agent/sessions` (`/resume`); credentials in
  `~/.pi/agent/auth.json`. Images never retain them; saved sessions do.
- [`settings.json`](settings.json) keeps Pi's regular TUI: fullscreen mode
  captures the mouse, taking selection and copy from Dolly's terminal. It
  names no model: the provider's catalog changes under any default.
- `pi --offline` skips catalog and update traffic, not model requests.

## Key files

- [`Dollyfile-pi-build`](Dollyfile-pi-build), [`Dollyfile-pi-coding-agent`](Dollyfile-pi-coding-agent), [`pi.c`](pi.c): build and launcher.
- [`SYSTEM.md`](SYSTEM.md), [`settings.json`](settings.json),
  [`skills/dolly/SKILL.md`](skills/dolly/SKILL.md): the agent's Dolly guidance.
- Tests: [`test/`](test/).

## Limits

- No npm client or native addons; installing Pi packages that need npm fails.
  Dependency-free JavaScript extensions work via `~/.pi/agent/extensions/`.
- Image resizing is off: Photon needs nested WebAssembly. Another agent
  directory needs `"images": {"autoResize": false}` in its `settings.json`, or
  Pi omits prompt images it cannot resize.
- The `codemode` tool fails: its QuickJS sandbox needs nested WebAssembly and
  worker threads.
- OAuth logins depend on the provider's CORS; there is no callback listener.
- No PTY: run `nvim` from Slop, not from Pi's shell tool.

Test: `npm run test:demos -- pi` ([`test/`](test/)).
