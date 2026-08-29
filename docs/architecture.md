# Dolly architecture experiment

## Thesis

A useful coding environment can be constructed as a shared-everything wasm64
userspace. Programs use a common POSIX-like libc and an in-Wasm filesystem, so
porting a conventional C or C++ program should primarily be a build-system task.

This is intentionally not a JavaScript implementation of WASI. The browser is
the loader and I/O device; Dolly owns machine state. The goal is a small,
defined compatibility API for agent tools—not the ambiguous promise that tools
run on “Node on something Linux-like.” Serial, synchronous behavior is the
default whenever it can preserve useful source compatibility.

## Module contract, version 0

The first implementation uses Emscripten's existing dynamic-linking convention
as an executable specification:

- target: `wasm64-unknown-emscripten` (`-m64`);
- main module: operates over the shared memory and owns the table, allocator,
  libc, WasmFS, descriptors, and lifecycle state;
- side module: position-independent and imports the shared memory/table;
- executable side modules export `int dolly_main(int argc, char **argv)`;
- all modules use the same pointer width and C/C++ ABI;
- the JavaScript loader resolves modules but does not service root-filesystem
  calls.

### Executable files

Linux `execve` recognizes an ELF file, maps its segments, asks the dynamic
loader to resolve dependencies, and enters the address recorded by the ELF
header. Dolly's version-0 equivalent is a regular WasmFS file containing a
WebAssembly dynamic module with:

- the standard WebAssembly magic and wasm64 code;
- a leading `dylink.0` section describing shared-memory/table relocation;
- an import for Dolly's shared memory, plus only the relocation-base, table,
  stack, and allowed ABI symbols that its code actually uses;
- one `dolly.abi` custom section containing the selected contract digest;
- `__wasm_call_ctors` and `dolly_main(i32, i64) -> i32` exports.

The shell only resolves the path. `dolly_spawn` routes descriptors, and
`dolly_run_filesystem_module` uses the dynamic loader to relocate the module and
call `dolly_main`. Thus the executable is the module itself—not a wrapper or a
filename convention. It is currently closer to ELF `ET_DYN` than a static
`ET_EXEC`, because commands intentionally import libc and machine state from the
runtime. Version 0's build validator enforces the full structure and ABI stamp;
the in-browser loader additionally requires a loadable module and the typed
entry export.

`abi/dolly-0.wat` is the authoritative machine contract. Its imports define the
allowed command-to-runtime surface using actual Wasm types; its exports define
the command entry surface. A small binary parser checks function signatures,
global types and mutability, memory64/table64 limits, namespaces, exports,
section shape, and `dylink.0` before a module can enter the image.

The build derives Emscripten's `build/runtime-exports.json` linker input from
that contract, then uses DCE-enabled `MAIN_MODULE=2` to retain the declared
native runtime closure. The JSON file is disposable tool syntax, not a second
ABI description. This avoids the hundreds of dormant browser APIs pulled in by
`MAIN_MODULE=1` while preventing the command corpus from silently defining the
platform.

Command import reports remain useful for discovering what real programs need.
New imports must be evaluated and deliberately added to a future or compatible
contract rather than automatically becoming ABI.

Lua 5.5.1, QuickJS-ng 0.15.0, and Git 2.55.0 provide import reports from real
upstream runtimes and tools. Together with lifecycle, compiler, and HTTP
operations, the probe contract currently contains a broad typed libc/POSIX
surface: stdio, file descriptors, directory access, strings, regular
expressions, math, time, locale, and setjmp. It also showed that Emscripten
self-GOT relocations
and BSS start functions are object-format mechanics, not public capabilities.
This is a useful result but also a warning: making every libc entry point a
permanent Dolly ABI would stabilize the wrong layer. A later target should let
libc compile against a smaller fd/path/clock/entropy substrate while retaining
the shared memory and table contract.

Dolly now has a deliberately narrow in-Wasm compiler driver. Current Clang 24's
frontend and the WebAssembly LLD driver are linked into the trusted main module,
where their POSIX file operations resolve to WasmFS. This placement is
intentional: making LLVM a version-0 side module would expose its large libc and
C++ implementation surface as command ABI. The driver compiles PIC memory64
objects, rewrites upstream `main` to an internal symbol, and links a generated
entry adapter so conventional zero-, two-, and three-argument forms all produce
the exact `dolly_main(i32, i64) -> i32` export. It ABI-stamps a staged shared
command under `/tmp` and publishes only the completed file to its final WasmFS
path. It never invokes an external linker process.

Each command is compiled with hidden default visibility, while its generated
`dolly_main` adapter is explicitly exported. Internal cross-translation-unit
symbols therefore bind within that executable instead of entering Emscripten's
process-global GOT. This is required for process-shaped behavior: unrelated
programs commonly reuse names such as `program`, `execute`, or `array`, and
must not interpose one another merely because Dolly shares one Wasm table.

The C bootstrap only establishes terminal descriptors and persistent process
environment, then compiles `/bin/slop` and every Dolly-authored seed command
independently from source. It launches `/etc/dolly/startup.slop` as an ordinary
filesystem executable. That script enables `set -ex`, creates userspace
configuration, compiles and runs One True Awk's target-side `maketab` generator,
links `/bin/awk`, and then builds GNU Make 4.4.1 directly. It uses Make rules
from `/usr/src/dolly/startup.mk` for the remaining graph. Those rules compile
pinned upstream sbase `grep`, `sed`, `head`, and `wc`, Fetch-backed
`/usr/lib/libcurl.a`, zlib, Git, `/usr/bin/curl`,
`/usr/bin/git`, `/usr/bin/qjs`, and `/usr/bin/demo`, plus a
C++23 probe at `/usr/libexec/dolly/cpp-check`. QuickJS-ng's engine sources are
unchanged; a Dolly CLI adapter intentionally excludes its ambient POSIX helper
library. Awk's parser is generated reproducibly with a pinned build-time Bison;
its upstream `maketab` generator is compiled and executed inside Dolly so the
resulting `proctab.c` is born in WasmFS. `/usr/bin/lua` is the optional upstream
bootstrap runtime. Slop keeps only unavoidable stateful operations (`:`,
`exit`, `cd`, `export`, `unset`, and `set`) as builtins; utilities resolve to
filesystem modules. The image contains the current
Emscripten, Clang, and selected pinned upstream sources needed for those builds.
The general-purpose `/bin/cc` and `/bin/c++` compile source from WasmFS, accept
separately compiled object and GNU archive inputs, resolve `-L`/`-l`, and
validate the complete linked import/export surface against the in-Wasm copy of
`dolly-0` before publication. `/bin/ld` provides the object/archive-only form
of the same in-process link and validation path. `/bin/ar` creates deterministic
GNU archives with LLVM. Broader libc/libc++ link policy and exception support
remain subsequent compiler-driver work.

## Isolation model

The complete userspace is isolated from the browser host by WebAssembly. Side
modules are not isolated from each other: they intentionally share an address
space, allocator, filesystem, and runtime ABI. Executable-local symbols are
hidden to prevent accidental interposition, but this is a correctness rule,
not a security boundary. The model is still analogous to loading libraries
into one process, not launching mutually distrusting containers.

Containment assumes the complete userspace can be compromised. Internal ABI
validation is therefore not the security perimeter: the outer import closure of
`dist/dolly.wasm` is. `env.dolly_http_dispatch` is the single intentional
agent-selected network edge, and the browser implementation behind it must
enforce all destination and credential policy. Corruption of ephemeral Dolly
state is acceptable; acquiring a new host capability or exporting data through
an unapproved channel is not. The complete threat model and its availability
caveats are in [`security.md`](security.md).

## Browser boundary

Allowed browser operations are deliberately narrow:

1. fetch immutable Wasm/code assets;
2. compile and instantiate side modules against Dolly's imports;
3. deliver terminal or UI input;
4. display terminal, canvas, audio, or downloaded output;
5. supply clocks, entropy, and immutable startup configuration;
6. perform explicitly brokered HTTP requests.

Filesystem paths, descriptors, contents, working directories, environment,
pipes, and process bookkeeping remain in Wasm memory. The root is explicitly a
WasmFS memory backend. WasmFS's JavaScript backend hooks exist only for output
terminal character devices, which are necessarily browser-facing.

The runtime lives in a Web Worker and blocks there on WebAssembly atomic wait.
The UI writes raw Ghostty bytes into a single-producer/single-consumer mailbox
inside the shared Wasm memory, then notifies its atomic wake word. The mailbox
layout and exact typed runtime exports are defined by
`abi/dolly-terminal-0.wat`. JavaScript neither parses shell lines nor maintains
descriptor or process state.

Two explicit output-device callbacks, `env.dolly_terminal_write` and
`env.dolly_terminal_write_bytes`, display terminal bytes. Emscripten's browser
stdin fallback is absent from the artifact. WasmFS fd 0 instead calls Dolly's
native canonical terminal device. The shell consumes the same raw queue for its
own line editor; foreground commands consume it through ordinary libc stdin.

Version 0 lifecycle is deliberately bounded and synchronous. `dolly_spawn`
allocates a process-table slot, routes descriptors 0/1/2 with WasmFS `dup2`,
runs the filesystem module, and records its status. `dolly_wait` collects the
status and releases the slot. Slop pipelines and command substitution execute
one stage at a time and spool through unlinked WasmFS temporary files. GNU Make
uses the same rule for recipes and `$(shell ...)`; accepted `-jN` values have
one effective job. Command-local `exit` returns through a nested
setjmp boundary. Because Emscripten retains `dlopen` instances, Dolly snapshots
each module's relocated static region after initialization and restores it on
entry, providing fresh data/BSS across repeated commands. Complete
command-local heap/descriptor reclamation remains future work. Concurrent
scheduling is intentionally deferred unless a concrete tool cannot be adapted
with simpler synchronous semantics.
Libc-owned state outside a side module, including installed signal handlers, is
also shared in version 0 and is not yet restored at command boundaries.

HTTP uses a second versioned shared-memory mailbox. A command supplies a method,
URL, headers, fixed request body, flags, and callbacks to `dolly_http_perform`;
the worker asks the browser provider to perform the request and the browser
publishes status, effective URL, headers, and bounded response chunks while the
worker blocks. The command consumes those chunks inside Wasm, so the browser
never receives a WasmFS path or descriptor. A source-compatible libcurl layer
implements the easy and synchronous multi surface exercised by Git above this
API. It does not add an import: all agent-selected network traffic still crosses
only `env.dolly_http_dispatch`.

## Compatibility milestones

1. Multiple C/C++ side modules sharing WasmFS.
2. In-Wasm argv/environment, repeatable entry-point invocation, and cleanup.
3. A module registry plus bounded `spawn`/`wait` without native processes. The
   synchronous version-0 table and descriptor routing now exist; complete
   resource reclamation remains.
4. Current Clang/LLD compiled for Dolly and writing new C and C++23 side modules
   directly to WasmFS. `/bin/cc`, `/bin/c++`, `/bin/ld`, and `/bin/ar` expose
   compilation, multi-object linking, and archive/library linking.
5. A small shell and build graph executor. Source-built `/bin/slop` provides the
   finite recipe language, and upstream GNU Make now supplies dependency-graph
   execution. Pipelines, `$(shell ...)`, and `-jN` use serial semantics.
6. A practical JavaScript runtime. Pinned QuickJS-ng now compiles from source
   inside Dolly and provides ECMAScript execution; module loading and selected
   Node-shaped APIs remain separate, explicit work.
7. CPython after upstream wasm64 support and a reproducible source-generation
   build graph exist.
8. Git local operations and direct upstream HTTP-helper execution. These now
   work: Git, zlib, and the helpers compile from pinned sources, and the helper
   performs smart-HTTP discovery through Fetch-backed libcurl. Transparent
   `git clone` still needs a helper-protocol integration; a narrow synchronous
   adapter should be attempted before a general scheduler.

Literal upstream Node is not an initial target because V8 does not have a
WebAssembly target architecture. It is a different research project from
making a C/POSIX userspace.

The evidence and acceptance gates for Git, Vim, CPython, and Node are tracked
in [`port-status.md`](port-status.md). A deferred port names a missing
platform facility; it is not replaced with a host call or opaque binary.

## Questions the POC must answer

- Does wasm64 dynamic linking work reliably in target browsers?
- Can WasmFS remain the sole filesystem authority under dynamic loading?
- Can repeated program invocations cleanly reset globals, TLS, stack, and
  `atexit` state?
- Which Slop/POSIX gaps are demonstrated by CPython and Git clone/fetch builds?
- How many process-shaped APIs can use simple synchronous semantics before a
  real agent workload proves that concurrency is necessary?
- How much JavaScript remains after replacing Emscripten's loader policy?
- Can a compiler output be instantiated without copying it through a second
  host-owned representation?
