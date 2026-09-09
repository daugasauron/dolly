# Codex in Dolly

`npm run image -- codex` builds the pinned upstream CLI in a browser. The Rust
compiler is an external seed; Patti, Protox, Codex, their build scripts, procedural
macros and native libraries execute and compile inside Dolly. No application
binary is supplied by the host.

The reusable stages are `rust-sdk`, `rust-tools`, `ripgrep`, `protox-build`,
`codex-build`, and `codex`. The Codex build stage keeps the completed CLI and its
command record, and discards the temporary Rust SDK and crate artifacts. The
runtime image copies that CLI into the default userspace, including source-built
`rg`. Compiler tools remain available separately in `rust-tools`.
The runtime opens the Codex TUI; quitting returns to Slop, where `codex` starts it
again.

`config/rust/sources.json` and `config/rust/codex-git.json` pin source archives.
The preparation script verifies all registry archives against Cargo.lock, applies
`config/rust/patches` and `config/codex` adaptations, and packages source inputs.
Unused `.snap` test expectations are excluded from the ustar bundle. No upstream
application code is compiled during preparation. `modules/codex-build.dm` shows
the complete offline Patti invocation and every source override. Its command
record is retained at `/usr/share/dolly/builds/codex.json`.

The launcher creates a session installation ID and default configuration only
when absent. Existing `CODEX_HOME` files survive subsequent invocations. The
image contains no credentials or deterministic model backend. Its default
provider uses OpenAI's HTTPS Responses API with WebSockets disabled. Configure
API access through ordinary Codex configuration/login and the browser's HTTP
broker before sending a request. A different Responses provider can be selected
in `~/.codex/config.toml`.

The browser broker owns destination, credential, redirect and quota policy.
Codex's OS sandbox is disabled inside this already isolated Wasm userspace;
commands operate on Dolly's shared memory filesystem. Native sockets, process
fork hooks, application threads and advisory file locks remain unavailable.
Tokio runs a current-thread executor; filesystem work is synchronous and child
processes use Dolly spawn/wait. The model's reqwest 0.12 client uses the existing
process HTTP API. Other socket-based clients, including HTTP MCP's reqwest 0.13
transport, remain unsupported.
TUI sessions are ephemeral. History persistence, plugins and analytics are
disabled in the default config. Native clipboard access is unavailable; terminal
text paste still works.
SQLite uses one connection and the dotfile VFS instead of WAL/thread workers.

The `rust-tools`, `ripgrep`, `tokio` and `codex` browser harness modes exercise the
port. Prepare the Tokio fixture with `python3 test/fixtures/prepare-tokio.py`
after preparing the Codex sources. The Codex TUI test supplies a local Responses
fixture, then checks editing, paste, an actual shell tool, exact file contents,
status display and clean exit. That fixture is test code, not an image provider.
