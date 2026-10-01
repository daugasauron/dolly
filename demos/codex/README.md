# Codex

The pinned upstream Codex CLI, built from Rust source inside Dolly by Patti. Only
the Rust compiler seed comes from outside ([Rust demo](../rust/README.md)).

## Images

- `codex`: Codex TUI with shell tools, ripgrep and fd.
- `codex-build`: Source-built Codex and its build record.

Open `/codex/`; build with `npm run image -- codex` (about 70 minutes). Quitting
the TUI returns to Slop; `codex` starts it again.

## Use

- Sign in with **Sign in with Device Code** or `codex login --device-auth`
  (ChatGPT backend), or an API key (OpenAI API). Credentials stay in
  `CODEX_HOME/auth.json` for the session.
- The broker still applies CORS: ChatGPT's backend needs a reviewed relay when it
  rejects the browser's preflight.
- The default [`config.toml`](config.toml) sets `approval_policy = "never"` and
  `sandbox_mode = "danger-full-access"`: Dolly itself is the sandbox. History,
  plugins, Apps and analytics are off.

## Key files

- [`codex-build.dm`](codex-build.dm): the complete offline Patti build; its
  record is kept at `/usr/share/dolly/builds/codex.json`.
- [`codex.dm`](codex.dm), [`launch.c`](launch.c): runtime image and launcher.
- [`config/`](config/): source pins ([`codex-git.json`](config/codex-git.json)),
  Patti settings ([`patti.toml`](config/patti.toml)) and target patches.
- [`prepare-codex-sources.py`](prepare-codex-sources.py): verifies and packages
  sources; compiles nothing.

## Limits

- Threads run on `threads@0` (at most 16 per process); children use Dolly
  spawn/wait.
- No native sockets, fork hooks, file locks or clipboard.
  Socket-based clients such as HTTP MCP are unsupported.
- SQLite uses one connection without WAL. TUI sessions are ephemeral.

Test: `npm run test:demos -- codex` ([`test/`](test/)).
