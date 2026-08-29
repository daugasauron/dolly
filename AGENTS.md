# Goal

Define a minimal but useful POSIX-like agent userspace interface for WebAssembly.
The final goal is to run pi agent as natively as possible in a browser with the
tools that coding agents actually need.

# Thesis

Agents are effective through shells and conventional command-line tools, but
they may not need a complete operating system. Dolly should provide the useful
parts: programs, arguments, environment, files, clocks, entropy, networking,
and lifecycle operations.

The compile target for programs and runtimes inside the WebAssembly sandbox is
the interface. Its Wasm imports, exports, data layout, pointer width, filesystem
semantics, and lifecycle rules matter more than a high-level wrapper API.

# Hard constraints

- Dolly runs in a browser WebAssembly sandbox and targets wasm64.
- Mutable userspace state lives in WebAssembly memory. This includes filesystem
  contents and metadata, file descriptors, working directories, environments,
  and future process bookkeeping.
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
  from Piodide merely because it already exists.

# Interface layers

Keep these layers distinct:

1. The machine ABI defines shared memory64/table64, module relocation, command
   entry points, and exact Wasm import/export types.
2. The platform substrate defines the smallest useful operations for files and
   paths, clocks, entropy, networking, and command lifecycle.
3. libc, C++, language runtimes, shells, and tools compile above that substrate.
4. Agent-facing behavior emerges from ordinary commands and files rather than
   a large agent-specific host API.

The current Emscripten main-module libc surface is an experimental probe, not
automatically the stable Dolly ABI. The long-term target should sit below libc
so arbitrary runtimes can share a small substrate without permanently exposing
every libc entry point.

# Runtime model

The initial implementation may use shared-everything dynamic objects: commands
share an address space, allocator, function table, libc, and filesystem. This
does not isolate commands from one another; the security boundary is between
the complete Dolly userspace and the browser host.

Process-shaped behavior such as `spawn`, `wait`, exit status, pipes, and signal
delivery should eventually be implemented inside Dolly. Until then,
subprocess-related operations must fail explicitly rather than escaping to the
host. Command-local `exit` is caught at the nested invocation boundary; fatal
`abort` remains a runtime-wide version-0 limitation.

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
- Verify changes in a real browser. Tests should prove shared in-Wasm state,
  module reload behavior, denied host access, and exact ABI compatibility.

# Bootstrapping direction

Use a current external C/C++ toolchain first to define and test the target. Once
the target is credible, compile a C/C++ compiler for Dolly so programs can be
built inside the sandbox and written directly into the shared filesystem.

Keeping the Wasm runtime interface, filesystem substrate, lifecycle model, and
browser network broker small and well defined is the central design priority.
