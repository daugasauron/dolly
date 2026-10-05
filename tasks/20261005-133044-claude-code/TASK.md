# Run Claude Code inside a Dolly image

- STATUS: CLOSED
- PRIORITY: 255
- TAGS: javascript,janis,agent,demo

Owner (2026-10-05): "add a parallel task to try to make claude work inside the
image, would need to extend janis I guess, or maybe just try to compile
node/npm completely?"

## Facts (npm, 2026-10-05)

- `@anthropic-ai/claude-code` 2.1.289 is a 187 KB wrapper (`bin/claude.exe`)
  around per-platform native executables (`-linux-x64`, `-darwin-arm64`, …).
  There is no JavaScript to run and no wasm platform, so neither Janis nor a
  complete Node port can run the current release.
- Releases up to at least 2.1.100 ship a bundled `cli.js` (49 MB unpacked,
  `engines.node >= 18`); 2.1.200 no longer does. The last `cli.js` release is
  the candidate.
- `@anthropic-ai/claude-agent-sdk` 0.3.289 follows the same native layout.

## Constraints

- Claude Code is proprietary (Anthropic's Commercial Terms). Dolly's images
  and sites must not redistribute it: a user installs it from the npm registry
  inside their own session. Its native executables are not unpacked or modified.
- Authentication is the user's own API key or an Anthropic-compatible endpoint
  (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`). Dolly builds no claude.ai
  sign-in path and no relay, and this machine's Claude Code login is never used.
- No Claude-specific code in the core or in Janis: every gap found is a general
  Node-compatibility fix (`20261005-132750-janis-node-gaps`) or an explicit
  unsupported result.

## Work

1. Find the last release with `cli.js`; list what it needs from Node (module
   system, `child_process`, TTY raw mode, `fetch`/streams, `WebAssembly`,
   workers, native add-ons, the vendored ripgrep) and what Janis lacks.
2. Time-boxed: what a complete Node port (V8 and libuv on Dolly's wasm64
   process ABI) would take, with evidence, and a recommendation.
3. Run it under Janis as far as it goes: start, render, one tool-using turn.

## Done when

- The findings and the recommendation are recorded here, or Claude Code
  completes a tool-using turn inside a Dolly session in a real browser.

## Candidate (measured 2026-10-05)

- The last release with `cli.js` is **2.1.112** (2026-04-16); 2.1.113 (2026-04-17)
  switched to `bin/claude.exe`. Tarball 18.7 MB, integrity
  `sha512-9FUgJ0EOvILyhIqxFKNVliebiUjL68dwpEW3eGSSe0vkVDJ1c5qMDNWc22gW3zkD7zRAqtfQPSGv0t4vMM2DPA==`.
  `registry.npmjs.org` serves it with `access-control-allow-origin: *`.
- Package: `"type": "module"`, `cli.js` (13.7 MB, one Bun-bundled ES module,
  `createRequire(import.meta.url)` for CommonJS parts), no dependencies;
  optional `@img/sharp-*` native packages; `vendor/ripgrep/<arch>-<platform>/rg`,
  `vendor/audio-capture/*.node`, `vendor/seccomp/*` native files (never unpacked
  or run here).
- It still works against the API today: with OpenRouter (below) and, from
  Node on the host, unchanged.

## What cli.js needs from the platform (static reading of the bundle)

- Modules: 899 static `import` statements of 46 `node:` modules, so every
  named import must exist at link time. Missing in Janis before this task:
  `path/posix`, `path/win32`, `stream/consumers`; `fs.fsyncSync`,
  `fs/promises.{link,readlink,symlink,truncate,constants}`,
  `child_process.ChildProcess`, `crypto.createPrivateKey`,
  `events.{once (non-enumerable),setMaxListeners}`, `net.{BlockList,connect,
  createConnection}`, `os.version`, `util.isDeepStrictEqual`,
  `v8.getHeapSnapshot`. `net.BlockList` is constructed during startup (proxy
  bypass list), so it must work.
- Node version: asserts `process.version` major >= 18 (Janis reports 22).
- WebAssembly: undici's llhttp (only for undici's own socket client, never on
  the fetch path) and Long.js's optional multiply helper inside `try`. Layout
  ("yoga") is TypeScript, no `.wasm` files. QuickJS's missing `WebAssembly`
  is therefore not on the path.
- `worker_threads`: only undici's `markAsUncloneable`/`MessagePort`, guarded.
  `bun:ffi` only when `typeof Bun` is defined.
- Platform: `process.platform` checks for win32 (83), darwin (40), linux (24),
  freebsd; `wasm`/`wasm64` take the generic paths. The native installer logs
  "does not support architecture: wasm64" and continues.
- ripgrep: the vendored `vendor/ripgrep/${arch}-${platform}/rg` does not exist
  for wasm64; `USE_BUILTIN_RIPGREP=0` selects `rg` from `PATH` (Dolly's
  `ripgrep` package). Its Grep/Glob tools and skill discovery spawn `rg`.
- Shell: the Bash tool needs an executable whose path contains `bash` or
  `zsh` (`SHELL`, `CLAUDE_CODE_SHELL`, then `/bin`, `/usr/bin`, ...).
  Dolly's shell is Slop; calling it bash would be the detection lie the
  porting rules forbid, and real bash needs `fork`. Decision: the Bash tool
  stays unavailable ("No suitable shell found"); Read/Write/Edit/Grep/Glob
  do not need it.
- HTTP: the Anthropic SDK over global `fetch` with streaming (SSE) bodies;
  telemetry, bootstrap, remote settings and MCP registry requests are
  non-essential (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`).
- CORS (browser only): `api.anthropic.com` allows every header Claude Code
  sends. OpenRouter's `/api/v1/messages` preflight allows `Authorization`
  and the `X-Stainless-*` headers but not `anthropic-version`,
  `anthropic-beta`, `x-app` or `x-claude-code-session-id`, so a browser
  origin cannot reach it with Claude Code's requests without a relay, which
  this task rules out. From the host, `curl` to
  `https://openrouter.ai/api/v1/messages` with `stealth/space-bunny-alpha`
  answers normally (`"Hello! How are you today?"`, 2026-10-05 23:00 JST).

## Node port or another engine (research, 2026-10-05)

- V8 cannot target WebAssembly: `v8config.h` rejects unknown host
  architectures, and even `--jitless` (V8 7.4) keeps builtins and bytecode
  handlers as machine code generated by mksnapshot. A wasm port means a new
  V8 backend emitting wasm and replacing its frame walking and tail calls;
  no such project exists. Dolly also forbids nested instantiation and
  executable memory. libuv has no WASI/emscripten platform upstream (only
  Wasmer's WASIX fork) and Node needs its thread pool, sockets and fork/exec.
- Browser "Node" products (WebContainers, Nodebox, BrowserPod) run JavaScript
  on the browser's own engine, which breaks Dolly's rule that userspace
  state lives in Wasm memory.
- Wasmer's Edge.js (MIT, 2026-03, v0.2.5) ports Node's own `lib/` and C++
  bindings onto N-API with QuickJS-ng as the engine, as wasm32-wasix (libuv
  fork, OpenSSL, ICU, pthreads). It is the only "real Node" that runs inside
  wasm; retargeting it to Dolly's wasm64 ABI would need a libuv backend over
  Dolly's gate, threads@0, sockets mapped to the HTTP broker, ICU and OpenSSL:
  months, on a young upstream.
- Engines: test262.fyi (2026-10-05) SpiderMonkey 98.4%, V8 97.6%, QuickJS-ng
  83.5% (89.1% without Intl). Dolly already builds SpiderMonkey 128 for
  wasm64 (0 A.D., `--disable-jit`, external emscripten bootstrap); it has ESM
  hooks, but replacing QuickJS means rewriting `quickjs-main.c` against the
  C++ embedding API and moving the build onto Dolly's toolchain (weeks). Its
  speed against QuickJS-ng here is not measured.
- Decision: extend Janis. Every gap Claude Code has hit so far is an adapter
  gap, not an engine limit, and each fix is a general Node behaviour.
  Revisit the engine only for an engine-level failure.

## Under Janis (2026-10-05/06, branch `work/claude-code`)

How it runs, inside a session of `system` + `javascript` + `ripgrep`
(`ripgrep` needs `REQUIRES HOST threads@0`); nothing is added to an image:

    curl -fsS https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.112.tgz -o /tmp/cc.tgz
    gzip -dc /tmp/cc.tgz > /tmp/cc.tar && tar -xf /tmp/cc.tar -C /opt/claude-code
    env USE_BUILTIN_RIPGREP=0 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
      ANTHROPIC_API_KEY=... janis /opt/claude-code/package/cli.js

Gaps it hit, in the order met; each is a general Node behaviour fixed in
Janis and checked against Node 22 in the oracle (`demos/javascript/test/`):

1. `.js` entry in a `type: module` package ran as a script; ESM named
   imports of absent exports failed linking (list above).
2. `process.exitCode` started as `0`; Claude Code read that as shutdown.
3. Unhandled rejections were dropped silently (no QuickJS tracker), so
   failures exited 0 with no message.
4. `net.BlockList` is built at startup.
5. No `Intl.DateTimeFormat`/`NumberFormat`/`RelativeTimeFormat`/`Locale`
   (QuickJS has no ICU): the system prompt's date and time zone failed.
6. `process.exit` threw to unwind; Claude Code's `catch` then SIGKILLed itself.
7. `crypto.createHash("sha1")` (the Read tool's file state).
8. stdin had no `ref()`, `'readable'` or `read()`, which Ink uses.
9. `fs.watch` threw; chokidar re-emitted it as an unhandled `error` event.
10. `EventEmitter.call(this)`/`Stream.call(this)` with `util.inherits`
    (qrcode, pngjs) and `zlib.Inflate` as a base class: the interface's
    module graph failed to load, so the REPL never rendered.

Interactive, Chromium, `javascript` image 2026-10-06 00:08 (commit
`024e246a`), with `~/.claude.json` saying onboarding is done (first-run
onboarding checks `GET api.anthropic.com/api/hello`, which an explicit
broker policy may refuse): the REPL renders in Dolly's terminal, a typed
"Read /workspace/hello.txt and tell me what it says" shows "Read 1 file" and
"The file says: DOLLY-FIXTURE-CONTENT", and Ctrl+C twice exits 0. A request
for the Bash tool returns "No suitable shell found. Claude CLI requires a
Posix shell environment" to the model. Screenshots and logs:
`build/claude-evidence/claude-ui-*.png`, `claude-run-5.log` (scratch driver,
not committed: it downloads Claude Code at run time).

Remaining, decided: the Bash tool stays unavailable (no bash; Slop is not
bash); OpenRouter is unreachable from the browser by CORS, so a real model
in the browser needs an Anthropic API key (`api.anthropic.com` accepts the
browser's request, shown by the 401 above) or an endpoint that allows
Anthropic's headers; the plugin marketplace install fails and retries.
Closed: Claude Code completed a tool-using turn inside a Dolly session in a
real browser, and the findings and recommendation are above.

Measured (Chromium, `javascript` image 2026-10-05 23:35):

- Install inside the session: tarball 2.5 s, unpack 3.2 s.
- `claude --version` 4.5 s, `--help` 4.4 s.
- `-p` against `https://api.anthropic.com` with an invalid key: the
  broker carried a correct Messages request and Anthropic answered `401
  authentication_error: API key is invalid` (196 s: Claude Code itself retries
  a 401 eleven times with backoff, 3 min 20 s natively too).
- `-p` against a scripted Anthropic Messages endpoint on the test page's own
  origin (a fixture standing in for the model, not a relay): the model asked
  for `Read /workspace/hello.txt`, Claude Code read it inside Dolly and
  answered `The file says: DOLLY-FIXTURE-CONTENT`: a tool-using turn in a
  real browser. The request carried model, tools (23), `anthropic-version`,
  `anthropic-beta` and the API key header.
- Native host build of Janis (scratch only, curl standing in for the broker),
  real model `stealth/space-bunny-alpha` via OpenRouter: `-p "say hello"`
  answered `Hello!`; a Read + Edit turn changed the file; Grep ran `rg`
  through `child_process`; the interactive REPL rendered and answered
  `Hello!` to a typed prompt.
