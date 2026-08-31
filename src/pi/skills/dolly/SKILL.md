---
name: dolly
description: Understand, inspect, test, and improve the Dolly browser WebAssembly userspace.
---

# Dolly

Dolly is a minimal POSIX-like userspace for coding agents, contained in a
browser WebAssembly sandbox. Its source is
<https://github.com/daugasauron/dolly>.

Use this skill when a task concerns Dolly itself, its ABI, browser boundary,
Dollyfiles, toolchain, commands, Pi integration, terminal, or tests.

## Non-negotiable model

- The complete in-Wasm userspace is one trust domain. Commands may share
  memory, libc state, a function table, and the WasmFS filesystem.
- Mutable files, descriptors, working directories, environments, and command
  bookkeeping live in WebAssembly memory. No command may reach a host file or
  native process.
- `env.dolly_http_dispatch` is the sole intentional agent-selected network
  edge. Browser policy owns destinations, credentials, redirects, quotas, and
  approval. Never add an ambient `fetch`, socket, Node, or native-host escape.
- The target is memory64/table64. The canonical machine contract is WAT/Wasm;
  generated JavaScript metadata is not the ABI source.
- Prefer unchanged upstream programs plus target configuration. Add substrate
  operations only when a real program demonstrates a reusable requirement.

## Repository map

- `abi/`: typed Wasm machine contracts and snapshot extension.
- `include/dolly/`: C-facing platform and HTTP interfaces.
- `src/dolly.c`: runtime, shared filesystem, command lifecycle, and boot.
- `src/runtime-worker.mjs`: isolated worker instantiation and broker mailboxes.
- `src/browser.mjs`: trusted browser UI and capability provider.
- `src/http-policy.mjs`: browser-side network authorization.
- `src/slop.c`: deliberately small shell compatibility surface.
- `src/libcurl-fetch.c`: libcurl compatibility over Dolly HTTP, never sockets.
- `src/runtimes/`: QuickJS/Janis, Node compatibility, and CPython ports.
- `src/pi/`: Pi extension, prompt, settings, theme, and skills.
- `Dollyfile*`: sequential, auditable image recipes.
- `scripts/build.sh`: host build and pinned upstream source staging.
- `scripts/build-snapshot.mjs`: executes a Dollyfile inside Wasm and emits an
  immutable boot image.
- `scripts/browser-harness.mjs`: real-browser security and behavior proofs.
- `test/`: fast contract and source-level regression tests.
- `docs/abi.md`, `docs/architecture.md`, `docs/security.md`, and
  `docs/dollyfile.md`: focused design references.

## Working method

1. Read `AGENTS.md` and the relevant focused document before changing code.
2. Trace behavior across all four layers: machine ABI, platform substrate,
   libc/runtime, then command or agent behavior.
3. Keep Dollyfile operations sequential and every external byte pinned by
   SHA-256. Update the recipe hash whenever a staged source changes.
4. Build with `npm run build`. Run `npm test`; for UI, broker, persistence, or
   lifecycle changes, also run the appropriate real-browser mode in
   `scripts/test-browser.sh`.
5. Inspect the main module's exact imports after ABI changes. A browser test
   must prove denied host access and the intended capability allowlist.

Inside a packaged Dolly image, `/seed/usr/include/dolly/` contains public
headers and `/usr/src/dolly/` contains selected build inputs, not the whole Git
repository. Clone the repository into `/workspace` when the task needs full
source history and network policy permits it.
