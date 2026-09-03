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
runtime. Version 0's build validator enforces the full structure and ABI stamp.
Immediately before every `dlopen`, the in-Wasm runtime repeats that structural
validation and requires exactly one matching `dolly.abi` stamp; filesystem
mutation therefore cannot bypass the contract merely by avoiding `/bin/cc`.

A regular file beginning with `#!` is the other version-0 executable form.
The runtime accepts one absolute in-Wasm interpreter path and at most one
interpreter argument, constructs the conventional interpreter/script argument
vector, and recursively uses the same synchronous `spawn`/`wait` boundary.
It cannot name a browser or host executable. This lets language installers
publish ordinary console scripts instead of compiling an adapter for every
entry point.

Dolly does not preserve or enforce Unix ownership and permission modes. The
snapshot formats contain file contents and paths, not mode bits; restored
regular files receive execute bits as inert compatibility metadata for tools
that preflight `PATH` candidates with `stat`. Loader validation of Wasm modules
and bounded shebang dispatch remain the actual execution checks.

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

QuickJS-ng 0.15.0 and Git 2.55.0 provide import reports from real
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

The C bootstrap installs the immutable packaged compiler seed into mutable
WasmFS paths, establishes terminal descriptors, then compiles `/bin/slop`,
`/bin/dollyfile`, and the essential compiler/archiver wrappers independently
from source. It invokes `/bin/dollyfile` with only a recipe locator and
deployment base. That C executable fetches, verifies, writes, builds, checks,
and retains each row strictly in order. Pinned `.dm` modules own their complete
build commands and cleanup: the default aggregate composes GNU Make 4.4.1,
sbase utilities, One True Awk, Fetch-backed libcurl, zlib, Git, Zig, and
Ghostty, while Pi-bearing images add QuickJS-ng and Pi explicitly.
QuickJS-ng's engine sources are unchanged; a Dolly CLI adapter intentionally
excludes its ambient POSIX helper library. Awk's parser is generated
reproducibly with pinned build-time Bison; its upstream `maketab` generator is
compiled and executed inside Dolly so `proctab.c` is born in WasmFS. Slop keeps
only unavoidable stateful operations (`:`,
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
3. write bounded key, text/IME, resize, pointer, and explicit-paste records;
4. blit a bounded RGBA framebuffer to Dolly's canvas;
5. copy a bounded active selection to the system clipboard only during an
   explicit local-user copy gesture;
6. supply clocks, entropy, and immutable startup configuration;
7. perform explicitly brokered HTTP requests;
8. start a bounded, user-visible download of an explicitly requested WasmFS
   file;
9. compress and persist an opaque filesystem snapshot after an explicit save.

Filesystem paths, descriptors, contents, working directories, environment,
pipes, terminal state, fonts, and process bookkeeping remain in Wasm memory.
The root is explicitly a WasmFS memory backend. During the source build only,
one output callback feeds a plain-text progress view because the resident
renderer does not exist yet; it is not a filesystem backend.

Named sessions do not mount browser storage. Wasm serializes its own tree and
streams opaque chunks through a fixed 1 MiB atomic mailbox; the page gzips them
into same-origin IndexedDB. `/load/?session=NAME` verifies the runtime and full
inherited Dollyfile identity before returning the bytes to Wasm for validation
and restore. See [`sessions.md`](sessions.md).

The runtime lives in a Web Worker and blocks there on WebAssembly atomic wait.
The UI writes fixed-size raw browser event records into a
single-producer/single-consumer mailbox in shared Wasm memory and notifies its
atomic wake word. The resident display module maps those records to Ghostty key
events, applies terminal-mode-aware encoding, and yields only encoded bytes to
Dolly's tty discipline. Emscripten's browser stdin fallback is absent. The
shell consumes the resulting queue through its line editor; foreground commands
consume it through ordinary libc stdin.

Terminal output is passed to the same resident module, whose source-built
Ghostty VT engine owns the grid and whose pinned stb_truetype/Iosevka path
rasterizes into the inactive of two bounded RGBA buffers. Atomic frame metadata
publishes a complete buffer. Browser JavaScript validates the index,
dimensions, stride, capacity, and shared-memory range, copies a stable frame,
and calls `putImageData`; it contains no terminal parser or glyph renderer. The
mailbox layout and exact typed exports are defined by
`abi/dolly-display-0.wat`.

A foreground command may exclusively lease those same frame buffers through
the typed operations in `abi/dolly-0.wat`. It receives the inactive RGBA8
buffer and semantic input records, never the browser mailbox or a DOM/canvas
handle. Ghostty continues to parse output while frame publication is suspended;
normal exit, command-local exit, and Ctrl-C all restore it at the command
boundary. See [`display.md`](display.md) for the ownership and lifecycle rules.

Mailbox version 3 includes two fixed in-Wasm clipboard buffers. `Ctrl+Shift+V`
publishes the browser's pasted UTF-8 bytes with an atomic
sequence/acknowledgement pair;
Ghostty performs bracketed-paste encoding inside Dolly. Pointer records install
a Ghostty selection, whose bounded plain-text form is published in the copy
buffer. `Ctrl+Shift+C` is the only path that asks the browser to write that
text to the system clipboard. Terminal escape sequences receive no clipboard
or DOM capability.

The final mailbox words are a PID-targeted interrupt sequence. While a nested
command owns the foreground slot, plain `Ctrl+C` publishes that command's PID
and advances the sequence instead of becoming a stdin byte. The worker observes
it at target-inserted control-flow checkpoints and in every blocking Dolly
operation, then unwinds only the nested command with status 130. QuickJS also
polls from its bytecode interrupt hook, so a JavaScript loop remains
cancellable and can release the interpreter heap before returning. Its build
uses the explicit `-fdolly-runtime-interrupt-handler` target mode so a generic
edge checkpoint cannot bypass that cleanup. At the idle Slop prompt Ctrl+C is
still ordinary terminal input
and clears the edited line. The browser can abort an in-flight Fetch while
waking the same command; this does not add another network or guest capability.

TTY identity follows descriptors rather than command names. Synchronous spawn
derives a three-bit child stdio TTY mask from the parent's descriptor identities
and the requested redirections, then restores the parent mask at the command
boundary. Non-standard character descriptors retain a `fstat` fallback.
Ordinary files and the temporary files used for serial pipelines are false.
Emscripten's generic native-style terminal ioctl is not used because Dolly's
tty discipline is the in-Wasm display/input device itself. This keeps
Node-shaped runtimes interactive at the canvas while making redirected output
truthfully non-TTY.

Version 0 lifecycle is deliberately bounded and synchronous. `dolly_spawn`
allocates a process-table slot, routes descriptors 0/1/2 with WasmFS `dup2`,
runs the filesystem module, and records its status. `dolly_wait` collects the
status and releases the slot. Slop pipelines and command substitution execute
one stage at a time and spool through unlinked WasmFS temporary files. GNU Make
uses the same rule for recipes and `$(shell ...)`; accepted `-jN` values have
one effective job. Command-local `exit` returns through a nested
setjmp boundary. Because Emscripten retains `dlopen` instances, Dolly snapshots
each module's relocated static region after initialization and restores it on
entry, providing fresh data/BSS across repeated commands. A runtime that must
outlive one command can instead export the presence-only
`dolly_preserve_module_state` marker. Dolly then retains that module handle and
does not restore its static image; CPython uses this to initialize once while
all invocations remain serialized in the same in-Wasm userspace. The marker
does not add a browser import or a new isolation boundary. Complete
command-local heap/descriptor reclamation remains future work. Concurrent
scheduling is intentionally deferred unless a concrete tool cannot be adapted
with simpler synchronous semantics.
Libc-owned state outside a side module, including installed signal handlers, is
also shared in version 0 and is not yet restored at command boundaries.

Version 0 implements the default foreground `SIGINT` action needed for reliable
interactive cancellation; it does not yet emulate the full POSIX signal API.
In particular, delivery is cooperative rather than kernel-preemptive, only the
foreground PID and `SIGINT` are supported, and user-installed handlers are not
dispatched. Code compiled by Dolly's C/C++ target receives edge safepoints as
part of that target. `dolly_spawn_timeout` adds a monotonic in-Wasm deadline,
inherits the earliest deadline through nested Slop invocations, and unwinds the
active command with status 124 at the same safepoints. Pi's noninteractive
shell tool supplies finite empty stdin and a 60-second deadline, preventing an
accidental reader from consuming the TUI and bounding instrumented CPU loops.
A foreign Wasm module that neither uses that target nor polls the lifecycle API
can still wedge the worker, so an outer deadline and worker-replacement
protocol remains necessary before the stronger claim that every arbitrary Wasm
binary is recoverable.

HTTP uses a second versioned shared-memory mailbox. A command supplies a method,
URL, headers, fixed request body, and flags to `dolly_http_start`; the browser
publishes status, effective URL, headers, and bounded response chunks, and
`dolly_http_poll` acknowledges one available record without blocking. Janis
interleaves that poll with Promise jobs and timers, so QuickJS `ReadableStream`
consumers see model bytes incrementally and Pi's thinking animation continues
while the one request is active. Synchronous C callers use
`dolly_http_perform`, which waits around the same start/poll primitives and
invokes callbacks. No variant exposes a WasmFS path or descriptor to the
browser. Fetch-backed libcurl implements the easy and synchronous multi surface
exercised by Git above this API. All agent-selected network traffic still
crosses only `env.dolly_http_dispatch`.

File export uses a separate, non-network contract. A command calls
`dolly_download_file` with a WasmFS path; the runtime verifies and copies one
regular file, then `env.dolly_download_dispatch` conveys only its sanitized
base name and at most 64 MiB of bytes. The worker transfers an unshared copy and
the page initiates an ordinary browser download. No command receives a DOM
object, browser filesystem API, host path, or read-back channel. See
[`download.md`](download.md).

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
6. A practical JavaScript runtime. Pinned QuickJS-ng compiles from source
   inside Dolly; Janis provides the measured filesystem, module, process,
   stream, event, timer, Fetch, and terminal compatibility needed by upstream
   Pi's full TUI and dependency-free extensions.
7. A second large language runtime. The Python image builds pinned CPython 3.14
   inside Dolly, then installs portable wheels through the libcurl-backed
   Bonnie client without adding a network edge.
8. Git local operations and direct upstream HTTP-helper execution. These now
   work: Git, zlib, and the helpers compile from pinned sources, and the helper
   performs smart-HTTP discovery through Fetch-backed libcurl. Transparent
   `git clone` still needs a helper-protocol integration; a narrow synchronous
   adapter should be attempted before a general scheduler.
9. Precompiled, recipe-bound system images. During `npm run build`, each
   headless image `/rebuild/`
   performs the complete target-side source build and exports an opaque,
   versioned snapshot as a static `dist` artifact. The prebuilt route verifies
   its build ID, size, format, SHA-256, exact raw recipe chain, entry record,
   and retained-path manifest before restoring it. Prebuilt boot does not fetch
   Dollyfile `SOURCE` inputs. The explicit image manifest excludes workspace,
   temporary, credential, and session state, and initial boot does not depend
   on browser-origin or profile storage.

Literal upstream Node is not an initial target because V8 does not have a
WebAssembly target architecture. It is a different research project from
making a C/POSIX userspace.

The evidence and acceptance gates for Git, Vim, CPython, and Node are tracked
in [`port-status.md`](port-status.md). A deferred port names a missing
platform facility; it is not replaced with a host call or opaque binary.

## Remaining questions

- How portable is the demonstrated wasm64/table64 dynamic-linking path beyond
  the tested Chrome version?
- Can repeated program invocations cleanly reset globals, TLS, stack, and
  `atexit` state?
- Which Slop/POSIX gaps are demonstrated by TypeScript and Git clone/fetch?
- How many process-shaped APIs can use simple synchronous semantics before a
  real agent workload proves that concurrency is necessary?
- How small can Janis remain as TypeScript and more useful agent extensions are
  used as compatibility probes?
- Which measured operations belong in an ABI below libc, and can multiple
  unchanged runtimes share it without expanding the browser import closure?
