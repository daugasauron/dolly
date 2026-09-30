# Pi

The Pi coding agent, unforked, running under QuickJS-ng and Janis
([JavaScript](../javascript/README.md)) as an ordinary private process over
Dolly's files, processes and HTTP broker.

## Images

- `pi`: Pi coding agent with JavaScript, shell tools, ripgrep and fd.
- `pi-runtime`: Reusable Pi and JavaScript runtime.
- `pi-build`: Pi packages compiled from pinned TypeScript sources.

Open `/pi/`; build with `npm run image -- pi`. Leave Pi with `/exit` or Ctrl+D.

For Claude, start the [local relay](../game-agent/README.md#local-relays), run
`upload ~/.pi/agent/models.json` in Dolly and choose the file it prints (upload
never overwrites), then `pi --provider claude-local --model claude-sonnet-5-5`.

## How it works

- `pi-build` runs the official TypeScript compiler inside Dolly and emits Pi's
  workspace packages to `/usr/lib/node_modules` (`noCheck` emit, no type
  checking). `pi-runtime` adds the prompt, settings, theme and extension.
- External packages are listed in [`pi-runtime-packages.txt`](pi-runtime-packages.txt)
  and verified against `package-lock.json`; `npm run pi:census` reports pins and
  licenses. They load from WasmFS, never from the network.
- [`dolly-tools.js`](dolly-tools.js) plugs Slop into Pi's `bash` tool and `!`,
  refuses to edit non-UTF-8 files and adds a `download` tool.
- Conversations live in `~/.pi/agent/sessions` (`/resume`); credentials in
  `~/.pi/agent/auth.json`. Images never retain them; saved sessions do.
- `pi --offline` skips catalog and update traffic, not model requests.

## Key files

- [`pi-build.dm`](pi-build.dm), [`pi.dm`](pi.dm), [`pi.c`](pi.c): build and launcher.
- [`SYSTEM.md`](SYSTEM.md), [`settings.json`](settings.json),
  [`skills/dolly/SKILL.md`](skills/dolly/SKILL.md): the agent's Dolly guidance.
- Tests: [`test/`](test/).

## Limits

- No npm client or native addons; installing Pi packages that need npm fails.
  Dependency-free JavaScript extensions work via `~/.pi/agent/extensions/`.
- Image resizing is off: Photon needs nested WebAssembly.
- OAuth logins depend on the provider's CORS; there is no callback listener.
- No PTY: run `nvim` from Slop, not from Pi's shell tool.

Test: `npm run test:demos -- pi` ([`test/`](test/)).
