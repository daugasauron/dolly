# Pi on Dolly

Pi runs under QuickJS-ng and Janis as an ordinary private Wasm process.
Its source is not forked: Dolly provides an extension and a finite Node-shaped
runtime over the shared filesystem, process API and HTTP broker.

## Build

`/usr/bin/tsc` runs the pinned official TypeScript compiler inside Dolly and
emits Pi's upstream workspace packages under `/usr/lib/node_modules`.
The source remains under `/usr/src/pi-source`.
This is `noCheck` JavaScript emit, not full TypeScript type checking.
An asserted post-emit transform lowers six Unicode-set regexes unsupported by
the pinned QuickJS version.

External JavaScript packages are selected by `config/pi-runtime-packages.txt`
and verified against `package-lock.json` before archival. They resolve from
WasmFS, not a host loader or runtime network download.
`npm run pi:census` reports their pins and licenses. There is no host Pi bundle;
host esbuild is used separately for browser WebGPU assets.

## Use

Pi's `bash` tool and interactive `!` execute Slop, not Bash.
`/bin/sh` is a compatibility alias to Slop. Child stdout/stderr stream through
real process pipes; cancellation uses the same lifecycle boundary as other tools.
Installed programs depend on the image: use `command -v TOOL`.

Leave Pi with `/exit` or Ctrl+D on an empty prompt. In Studio, run
`nvim /workspace/Dollyfile` from Slop for interactive editing, then `pi`
to return. Pi's captured shell tool is not an interactive editor terminal.
Tmux/split panes are not implemented.

Pi sessions live under `~/.pi/agent/sessions`; upstream writes a session after
the first assistant response. `/resume` uses those in-Wasm files.
Use a Dolly [session save](sessions.md) to retain them across page reloads.

Dependency-free JavaScript extensions can use `~/.pi/agent/extensions/` and
`/reload`. Compile TypeScript extensions with `tsc` first.
There is no npm client, native-addon support or arbitrary npm compatibility.
Pi package installation that needs npm fails explicitly.

## Network and credentials

Credentials may live in Pi's in-Wasm `auth.json`. They are excluded from
standard system images but included in user session saves/exports.
The default broker permits HTTP(S), including caller credentials and requested
redirects, with byte/time limits but no lifetime request quota.
This is useful compatibility, not an exfiltration defense.

Catalog refresh and model inference are separate requests. A failed optional
catalog refresh does not prove that a key or chat endpoint is broken.
`pi --offline` skips startup catalog/update traffic; it does **not** disable
provider conversations. Version checking is disabled by the image profile.

OpenRouter and fixture tool-use flows have browser coverage. Manual PKCE OAuth
has fixture coverage, but real-provider login still depends on browser CORS and
supported callback flows; there is no native listener.
See [HTTP](http.md), [CORS](cors.md) and [local models](browser-local-models.md).
Local model loading requires the user's explicit browser action.

## Limits and verification

Janis provides filesystem/package resolution, timers, streams, crypto helpers
and child processes; [its contract](javascript-runtime.md) records limitations.
No raw sockets, worker threads, detached jobs, host environment or
`process.binding` escape is available.

Pi image resizing is disabled: Photon needs JavaScript's nested WebAssembly API,
which Janis does not expose. Supported image input passes through unchanged.

Browser fixtures cover the TUI, split UTF-8/SSE, live child output, cancellation,
credential persistence and target-compiled extension use. Local small-model
independent Studio tasks remain unreliable; see the [handoff](audit-handoff.md).
