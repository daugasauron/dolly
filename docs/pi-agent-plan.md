# Pi on Dolly

Status: upstream Pi TUI and JavaScript extensions run; TypeScript source build
remains planned. Last updated: 2026-09-01.

## Purpose

Pi is Dolly's primary agent workload. The objective is not to reproduce Node or
Linux; it is to measure which filesystem, terminal, lifecycle, JavaScript, and
network behavior a useful coding agent actually needs.

```text
upstream Pi bundle
       │
       ▼
QuickJS-ng ── Janis node:* subset ── Pi Dolly extension
       │                │                    │
       └────────────────┴────────────────────┘
                        │
                shared WasmFS + Slop
                        │
       Ghostty RGBA ◀── Dolly runtime ──▶ one HTTP broker
```

Everything above the broker lives in the shared wasm64 userspace. No Node
process, host filesystem, socket, DOM, browser `fetch`, or native subprocess is
forwarded into Pi.

## What works

- `/usr/bin/pi` is a normal filesystem executable resolved through `PATH`.
- Pinned upstream Pi 0.84.4 runs on source-built QuickJS-ng through Janis.
- The complete interactive TUI renders through Ghostty inside Wasm; raw input,
  resize, timers, selection, paste, copy, Ctrl-C, and Ctrl-D are exercised in a
  real browser.
- A normal Pi extension provides `bash`, `read`, `edit`, and `write` behavior
  through `/bin/slop`, Dolly lifecycle calls, and shared WasmFS. Pi is told that
  the available shell is Slop; it does not need a hidden `sh` or `bash` binary.
- Model responses stream incrementally while Pi's Promise jobs, timers, and
  terminal frames continue to advance.
- OpenRouter keys and OpenAI Codex OAuth credentials are written by Pi to its
  in-Wasm `auth.json`. Login and fresh-process model discovery are browser
  tested. Credentials are not baked into snapshots.
- The Codex flow uses Pi's upstream PKCE implementation. The unavailable local
  callback listener fails as `ENOSYS`, after which the supported manual-code
  path completes through the same HTTP broker.
- Dependency-free JavaScript extensions install into WasmFS, reload through
  upstream Jiti, and can invoke tools. Arbitrary npm packages and native addons
  are not supported.
- Pi's latest-version request is disabled with `PI_SKIP_VERSION_CHECK=1`; it no
  longer creates a useless CORS error at startup.
- An unexpected nonzero top-level Pi exit is retried twice in the same WasmFS.
  Normal exit and Ctrl-C still enter the recovery shell. This protects against
  transient provider/JavaScript failure but is not a substitute for fixing a
  reproducible crash.
- Pi receives an installed Dolly skill describing the architecture, security
  boundary, source tree, and supported development workflow.

Pi itself is not forked. Packaging makes asserted compatibility lowerings for
unsupported QuickJS syntax, routes bundled Node builtins to Janis, and retains
Pi's standalone OAuth registration table. These transformations fail when the
expected upstream input changes.

## Compatibility boundary

Janis is deliberately finite. It implements only behavior demonstrated by Pi
or a named extension:

| Surface | Dolly implementation |
| --- | --- |
| `process`, argv, env, cwd | command-local state over Dolly libc/WasmFS |
| `Buffer`, encoders, URLs, paths | in-process JavaScript/C helpers |
| `node:fs` and `fs/promises` | synchronous WasmFS operations; settled Promises where required |
| events, timers, Promise jobs | one serial cooperative event pump |
| crypto hashes, HMAC, UUID, entropy | in-Wasm implementations plus Dolly entropy |
| standard streams and tty facts | Dolly descriptors and terminal device |
| child-process-shaped shell calls | synchronous `dolly_spawn`/`dolly_wait` with captured files |
| Fetch, responses, streams | `dolly_http_start`/`dolly_http_poll` over the sole browser broker |

Unsupported neighboring APIs fail explicitly. There are no worker threads,
detached jobs, native addons, N-API, raw sockets, proxy agents, ambient host
environment, or `process.binding` escape hatch. Promise-shaped operations may
be synchronous underneath because observable compatibility matters more than
parallelism in this experiment.

QuickJS-ng remains the engine until a concrete engine-level incompatibility
justifies a replacement. The comparison and replacement gate are in
[`javascript-runtime.md`](javascript-runtime.md).

## Display and input

```text
browser key/text/resize/pointer records
                    │
                    ▼
          versioned Wasm mailbox
                    │
                    ▼
 Pi stdin ◀── Dolly tty ──▶ stdout VT bytes
                              │
                              ▼
                    Ghostty + glyph rasterizer
                              │
                              ▼
                   bounded RGBA canvas blit
```

The browser captures necessary platform events and copies checked RGBA frames.
It does not interpret terminal cells, URLs, OSC commands, command names, or
filesystem paths. Clipboard transfer requires an explicit local-user gesture
and bounded shared-memory buffers. Fullscreen is likewise a browser gesture.
Details live in [`display.md`](display.md).

## Network and credentials

Pi creates ordinary HTTP requests inside Wasm. Janis converts them to Dolly's
typed mailbox protocol; only `env.dolly_http_dispatch` reaches trusted browser
code. A hardened embedding can restrict destination, method, credential header,
redirect, byte count, timeout, and request quota even after total userspace
compromise.

The public demo intentionally permits generic HTTP(S), subject to browser CORS
and finite quotas. A page cannot disable CORS. Pi's short system guidance is to
use direct CORS-enabled endpoints or an owned, reviewed relay and never expose
credentials to a public anonymous proxy. See [`cors.md`](cors.md) and
[`security.md`](security.md).

## Regression gates

1. The browser import allowlist changes only after capability review;
   `env.dolly_http_dispatch` remains the sole agent-selected network import.
2. Pi filesystem and module paths cannot observe host files or trigger network
   loading.
3. Credentials remain in mutable Wasm state and may leave only in request data
   accepted by browser policy; snapshots contain none.
4. Redirect, origin, credential-header, size, timeout, cancellation, and quota
   rules remain enforceable after total in-Wasm compromise.
5. Repeated Pi invocations reset timers, modules, descriptors, tty modes,
   command exit state, display ownership, and abandoned HTTP work.
6. A production-worker browser test performs login/model discovery, a streamed
   model turn, a tool call, a WasmFS edit, a Slop command, and terminal input.
7. Terminal output cannot autonomously write the system clipboard, open a URL,
   fetch an image, or select a DOM target.

## Next work

1. Run a pinned TypeScript compiler under Janis and compile single- and
   multi-file ESM fixtures into WasmFS.
2. Build pinned Pi TypeScript sources inside Dolly, then remove the
   host-generated compatibility bundle while retaining exact upstream-input
   assertions.
3. Finish Git's HTTP remote-helper path so Pi can install reviewed Git
   extensions using the existing broker.
4. Add package behavior only for concrete agent workloads. Keep native addons,
   lifecycle scripts, workers, and background processes out until evidence
   demands them.
5. Turn any reproducible unexpected Pi exit into a focused regression and fix
   its cause; retain the bounded restart only as session-loss mitigation.

The broader sequence and acceptance gates are in [`roadmap.md`](roadmap.md),
while exact current tool evidence is in [`port-status.md`](port-status.md).
