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

- The complete in-Wasm userspace is one trust domain. Ordinary commands have
  private memory and runtime state, with a shared kernel-owned WasmFS filesystem.
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

- `abi/`: typed Wasm machine contracts.
- `include/dolly/`: C-facing platform and HTTP interfaces.
- `src/dolly.c`: kernel integration and boot; `src/process-kernel.c`: process
  records, descriptors, signals and filesystem operations.
- `src/runtime-worker.mjs`: runtime Worker boot, image build and restore.
- `src/browser.mjs`, `src/host/`: trusted page and browser host modules.
- `src/http-policy.mjs`, `src/http-broker.mjs`: network authorization and transport.
- `src/slop.c`, `src/commands/`: the shell and Dolly's own commands.
- `src/libcurl-fetch.c`: libcurl compatibility over Dolly HTTP, never sockets.
- `Dollyfile*`, `modules/`: core image recipes. `demos/DEMO/`: everything else
  (JavaScript, Python, Pi, games) with its own recipes, sources and tests.
- `scripts/build.sh`: kernel and compiler seed; `npm run image -- IMAGE` builds
  an image inside Wasm in a headless browser.
- `test/`, `demos/*/test/`: source and real-browser tests.
- `README.md`, `abi/README.md` and `docs/`: architecture, process model, browser
  boundary, Dollyfile and other focused references.

## Working method

1. Read `AGENTS.md` and the relevant focused document before changing code.
2. Trace behavior across all four layers: machine ABI, platform substrate,
   libc/runtime, then command or agent behavior.
3. Keep Dollyfile operations sequential and every external byte pinned by
   SHA-256. Update the recipe hash whenever a staged source changes.
4. Build with `npm run build:runtime` and `npm run image -- IMAGE`. Run
   `npm run test:source`; for UI, broker, persistence or lifecycle changes, also
   run `npm run test:core` or the relevant browser suite.
5. Inspect the main module's exact imports after ABI changes. A browser test
   must prove denied host access and the intended capability allowlist.

In compiler-equipped images, `/usr/include/dolly/` contains public headers.
Retained build inputs are not the whole Git repository; `/seed` exists only
during root rebuilds. Clone into `/workspace` when the task needs full source
history and network policy permits it.
