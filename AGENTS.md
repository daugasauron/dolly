# Goal

Define a minimal but useful POSIX-like agent userspace interface for WebAssembly.
The final goal is to run agents such as pi agent as natively as possible in a
browser with the tools that coding agents actually need to be useful.

A secondary goal is to define the API an agent operates against, so it can be
specialized independently of the backend (currently the browser).

# Thesis

Agents are effective through shells and conventional command-line tools, but
they may not need a complete operating system. Dolly should provide the useful
parts: programs, arguments, environment, files, clocks, entropy, networking,
and lifecycle operations.

The compile target for programs and runtimes inside the WebAssembly sandbox is
the interface. Its Wasm imports, exports, data layout, pointer width, filesystem
semantics, and lifecycle rules matter more than a high-level wrapper API.

# Zen

- **Every line of code is a maintenance burden**
- This includes documentation, tests and comments.
- Every line in this repo has to earn its right to be there
- Documentation rot
- Removing code is a win
- Never keep/add code that "might be useful in the future"
- Simple is better than easy
- Nothing is a fact until measured
- Good code documents itself, extract functions and use variable names
- Write grepable code
- Avoid feature flags
- **Development iteration speed is king. Long turnover kills projects.**

# Hard constraints

- Dolly runs in a browser WebAssembly sandbox and targets wasm64.
- Mutable userspace state lives in WebAssembly memory. This includes filesystem
  contents and metadata, file descriptors, working directories, environments,
  and process bookkeeping.
- The browser host is not Dolly's filesystem and cannot provide native
  subprocesses.
- Network access crosses one explicit, restrictable browser broker. Programs do
  not receive ambient `fetch`, socket, or browser capabilities.
- Assume total compromise of the in-Wasm userspace. The outer imports of the
  main runtime and their trusted browser implementations are the security
  perimeter; internal command isolation is not required for host containment.
- `env.dolly_http_dispatch` is the sole intentional agent-selected network
  edge. Destination, credential, redirect, quota, and approval policy belongs
  to its browser-side provider and must remain enforceable after complete Wasm
  compromise.
- Programs share the same in-memory filesystem regardless of their source
  language or runtime.
- The core interface must remain small, typed, inspectable, and versioned.
- Dolly is a clean experiment. Do not import architecture or implementation
  from Pyodide merely because it already exists.

# Interface layers

Keep these layers distinct:

1. The machine ABI defines shared memory64/table64, module relocation, command
   entry points, and exact Wasm import/export types.
2. The platform substrate defines the smallest useful operations for files and
   paths, clocks, entropy, networking, and command lifecycle.
3. libc, C++, language runtimes, shells, and tools compile above that substrate.
4. Agent-facing behavior emerges from ordinary commands and files rather than
   a large agent-specific host API.

The process contract sits below libc. Its current Emscripten musl adapter is a
bootstrap implementation, not the stable interface. The resident Ghostty plugin
has a separate internal contract; programs must not compile against kernel libc.

# Runtime model

Ordinary commands run in fresh private Wasm memories. The Wasm kernel owns the
shared filesystem, descriptors, environments, spawn/wait, pipes and signals.
Private processes support lifecycle and recovery; the security boundary remains
between the complete Dolly userspace and the browser host.

Process exit, abort or forced Worker termination must preserve the kernel and
shell. Unsupported operations fail explicitly rather than escaping to the host.
Prefer simple serial semantics over multiprocessing or performance machinery.

# Development rules

- Use real upstream programs to discover requirements. Start with small C/C++
  programs, then exercise tools such as grep, Git, CPython, a practical
  Node-compatible JavaScript runtime, and compilers.
- Do not automatically allow every import emitted by a new program. Inspect the
  requirement, decide whether it belongs in the stable substrate, and evolve a
  versioned contract deliberately.
- Prefer unchanged upstream source plus target/toolchain configuration over
  source forks and per-program compatibility patches.
- Keep the canonical machine contract in WAT/Wasm. JSON may be generated when a
  JavaScript or Emscripten tool requires it, but it is not an ABI source.
- Make browser capabilities explicit and enforce their exact allowlist in
  tests. Never add Node or native-host fallbacks to make a browser test pass.
- Keep browser authority decisions short and directly reviewable by a human;
  maintain the review map in `docs/browser-boundary.md` when they change.
- Verify changes in a real browser. Tests should prove shared in-Wasm state,
  module reload behavior, denied host access, and exact ABI compatibility.

# Bootstrapping direction

An external toolchain builds the kernel and compiler seed. The resulting
in-sandbox C/C++ compiler builds ordinary programs into the shared filesystem.
Keep bootstrap exceptions explicit in `docs/sources.md`.

Keeping the Wasm runtime interface, filesystem substrate, lifecycle model, and
browser network broker small and well defined is the central design priority.
