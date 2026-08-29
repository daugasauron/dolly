# Dolly

Dolly is a greenfield experiment in putting a small coding userspace inside a
browser WebAssembly sandbox. Its mutable machine state belongs to WebAssembly,
not to a JavaScript filesystem adapter.

The security model assumes total compromise of that userspace: an agent may
read every in-memory file and corrupt the whole runtime without gaining a
capability the browser did not explicitly import. HTTP dispatch is the single
intentional autonomous network edge, so its browser-owned policy is the main
confidentiality and external-integrity boundary. See
[`docs/security.md`](docs/security.md) for the threat model, trusted computing
base, current limitations, and required invariants.

The browser now opens directly into an extremely small `slop` shell rendered by
`ghostty-web`. Ghostty owns VT rendering and keyboard events. Raw terminal bytes
enter a versioned atomic mailbox in Dolly's shared Wasm memory; the shell does
canonical line editing inside Wasm. Parsing, cwd, environment, descriptors,
filesystem operations, process bookkeeping, and command execution all live in
the runtime. Slop is itself compiled from source to `/bin/slop`; the main
runtime does not contain a second hidden command interpreter.

The runtime executes in a Web Worker, so an ordinary blocking `read(0, ...)`
does not freeze rendering. Dolly's WasmFS stdin device waits on the mailbox with
WebAssembly atomics. It never calls Emscripten's browser `window.prompt`
fallback. An unchanged Lua interpreter can therefore run its interactive REPL,
including canonical Ctrl+C line interruption and Ctrl+D EOF.

The proof uses a wasm64 Emscripten main module with WasmFS. Current Clang 24 and
LLD are linked into that trusted runtime as the seed compiler. The image carries
source and a C/C++ sysroot, not prebuilt shell tools: during browser boot, Clang
reads their sources from WasmFS, emits objects into `/tmp`, and in-process LLD
links and ABI-stamps staged commands there. Every core command has its own source
file and compiler/linker invocation before its completed executable is published
under `/bin`. Pinned, unchanged sbase sources provide `grep`, `sed`, `head`, and
`wc`; they too are compiled and linked inside the browser rather than packaged
as Wasm binaries. The same path compiles the C++23 `span`/`string_view`
probe from source. The outputs are then opened by their
filesystem paths with `dlopen` and run against the same memory, libc, table, and
filesystem as the compiler.

The remaining small probes and the upstream Lua interpreter are immutable
bootstrap assets for now. A writer creates a file; runtime-compiled C++23 and
upstream Lua verify it through ordinary `stdio` calls. JavaScript performs the
browser's required WebAssembly instantiation and explicit device brokering but
does not own mutable filesystem state. The browser test runs the complete
sequence twice, including unloading and reloading the filesystem-resident
modules.

Lua is fetched from its official release archive, checksum-pinned, and compiled
from unchanged upstream sources (all interpreter sources except the separate
`luac.c` executable). Its `os.execute` path is exercised too: the web-only
runtime returns `ENOSYS`, and no subprocess or host file is created. See
[`docs/lua-5.5.1.md`](docs/lua-5.5.1.md) for what this added to the ABI.

`/usr/lib/libcurl.a` is a Dolly implementation of the public libcurl surface
needed by Git. It is compiled inside Wasm against the official, pinned curl
8.21.0 headers. Its easy and synchronous multi handles translate methods,
headers, request bodies, callbacks, status, and effective URLs to Dolly's typed
HTTP service. Browser `fetch` streams response metadata and body chunks through
a versioned 64 KiB mailbox in shared Wasm memory. `/usr/bin/curl` is an ordinary
C client linked against that archive.

This is source/link compatibility, not curl's socket engine compiled for the
browser. TLS and HTTP protocol implementation belong to browser Fetch. Raw
sockets, FTP, custom TLS backends, certificate pinning, and socket callbacks do
not exist; unsupported operations fail explicitly. The library does not add a
browser capability: every request still crosses only
`env.dolly_http_dispatch`. See [`docs/http.md`](docs/http.md).

Pinned zlib 1.3.2 and Git 2.55.0 sources are also compiled into archives inside
Dolly. `/usr/bin/git` supports real local repositories: the browser test runs
`init`, config, add, commit, and log. Upstream `git-remote-http` and
`git-remote-https` are separately linked against the Fetch-backed libcurl, and
the test performs a Git protocol-v2 discovery request through the browser
broker. A normal `git clone` is not complete yet: Git starts the remote helper
as a concurrent subprocess, while Dolly version 0 deliberately provides only
synchronous filesystem-module calls.

The traced `/etc/dolly/startup.slop` creates a writable `/home/dolly`; the
runtime sets it as `HOME`, and the script initializes its global Git config
with the disposable identity
`Dolly <dolly@example.invalid>`. Commands can replace it normally with
`git config --global user.name ...` and `git config --global user.email ...`.

`/usr/bin/qjs` is built during browser boot from pinned, unchanged QuickJS-ng
0.15.0 engine sources. Dolly's adapter supplies filesystem-backed ESM loading,
top-level Promise draining, source/stdin execution, arguments, and a finite
native `Dolly` surface over WasmFS, lifecycle calls, clocks, entropy, and the
existing typed HTTP service. A JavaScript prelude builds only the Node-shaped
globals needed by measured agent code. The upstream `quickjs-libc.c` is
deliberately not linked because it would add `fork`, `exec`, `popen`, `dlopen`,
signals, and terminal control before Dolly has defined those facilities.

`/usr/bin/pi` is an ordinary filesystem executable linked against that same
source-built QuickJS library. Its current lean ESM bundle contains pinned
upstream Pi agent-core and Pi's real OpenAI-compatible streaming adapter. In
headless `pi -p` mode, `read` and `write` share WasmFS and `bash` executes
serially through `/bin/slop -c`; model traffic crosses only
`env.dolly_http_dispatch`. The browser test completes a two-request streamed
tool turn and verifies the resulting file. Pi's interactive TUI and the final
TypeScript-from-source build are intentionally still pending. See
[`docs/pi-agent-plan.md`](docs/pi-agent-plan.md).

`/bin/awk` is built from pinned One True Awk sources. A checksum-pinned Bison
3.8.2 generates the parser reproducibly at build time. During browser boot,
Dolly first compiles upstream `maketab.c` into a private non-PATH wasm64
executable under `/usr/libexec/dolly`, runs it against the shared WasmFS to
generate `proctab.c`, and then compiles the final Awk command. This exercises a
real target-side source generator without allowing the browser runtime to
invoke a host process.

`/usr/bin/make` is real GNU Make 4.4.1, built directly by the traced Dolly
startup script from a checksum-pinned official release and an exact source
manifest. The script then uses Make for the remaining source build graph,
including the Awk source-generator bootstrap. Its default shell is `/bin/slop`. Make's job
hook executes every recipe synchronously through
`/bin/slop -c`, and its `$(shell ...)` path captures output in an unlinked
WasmFS file. `-jN` is accepted for compatibility but clamped to one effective
job: multiprocessing and throughput are not version-0 goals.

Zig 0.16.0 and Ghostty's terminal core are also built inside the browser. Dolly
first compiles pinned WAMR interpreter sources into a private executable, then
uses it to run Zig's source-provided `zig1.wasm` with filesystem calls bound to
the outer WasmFS. `/usr/bin/zig` translates the pinned Ghostty/uucode source
graph to C; Dolly's normal compiler and archive writer produce
`/usr/lib/libghostty-vt.a` and `/usr/bin/ghostty-vt`. The cold-browser proof
feeds VT bytes into the public Ghostty C API and inspects the resulting cells.
No host Zig or precompiled Ghostty artifact is used. See
[`docs/zig-ghostty.md`](docs/zig-ghostty.md).

Filesystem-loaded commands share one entry ABI:

```c
int dolly_main(int argc, char **argv);
```

Each command is a wasm64 dynamic module: the `dylink.0` section describes its
relocation needs, a `dolly.abi` custom section selects the contract, and the
`dolly_main` export is its process entry. This is Dolly's current ELF-equivalent.
All C and C++23 examples use it, including real argument vectors. Sources
retain an ordinary `main`; the compiler renames the source symbol and the
linker adds a small adapter for the conventional zero-, two-, or three-argument
forms. The source-facing C convention can therefore vary while every
filesystem executable has one exact machine entry type. Command internals use
hidden Wasm visibility; only the declared entry surface is exported. This keeps
independent executables from interposing same-named C functions or data through
Emscripten's process-global dynamic-loader symbol table.

The canonical machine contract is [`abi/dolly-0.wat`](abi/dolly-0.wat). Its
imports are the facilities commands may use and its exports are the entry
points commands must provide. The build assembles it into a small Wasm contract
module, validates every command and the runtime against exact Wasm types, and
then derives Emscripten's required `build/runtime-exports.json` build input from
it. JSON is not an ABI source. See [`abi/README.md`](abi/README.md) for the
contract rules.

The terminal boundary is encoded in
[`abi/dolly-terminal-0.wat`](abi/dolly-terminal-0.wat). The complete generated
Emscripten browser boundary is separately categorized in
`config/browser-imports.json` and enforced by tests.

## Slop shell

Slop deliberately implements a finite compatibility language for building and
running tools useful to agents. It does not claim to be POSIX `sh` or a Linux
environment:

```text
: exit cd export unset set
/bin:      slop  help  pwd  cd  cat  echo  mkdir  touch  rm  clear  ls  grep  sed  head  wc  awk  cc  c++  ld  ar
/usr/bin:  curl  git  make  zig  ghostty-vt  qjs  pi  lua  demo
```

It supports quoting, environment and positional expansion, command
substitution, deterministic globbing, assignments, newline/`;`, `&&`, `||`,
`!`, serial pipelines, and common input/output/error redirections. Only
operations that must mutate the interpreter—`:`, `exit`, `cd`, `export`,
`unset`, and `set`—are built in. Utilities resolve through
`PATH=/bin:/usr/bin`, entirely inside WasmFS. Optional user-facing programs live
in `/usr/bin`; Lua is currently the only prebuilt command bootstrap.

Modules execute through a bounded in-Wasm `spawn`/`wait` table with explicit
descriptor routing. Version 0 is synchronous: pipelines and command
substitution spool through unlinked WasmFS files, and Make jobs complete one at
a time. Slop intentionally omits shell functions, loops, conditionals,
here-documents, background jobs, and job control. See
[`docs/slop.md`](docs/slop.md) for the boundary and next steps.

## Run

The build uses the pinned Emscripten 6.0.8 container with Podman or Docker. Build
the exact matching LLVM revision once; both the source and wasm64 static
toolchain are cached under `.cache/`. The first application build also needs
`curl` to download checksum-pinned Lua, Bison, Zig, and uucode source archives
and `git` to fetch the pinned curl, zlib, Git, GNU Make, sbase, One True Awk,
QuickJS-ng, WAMR, and Ghostty source revisions.

```sh
npm install
./scripts/build-toolchain.sh
npm test
npm run abi
npm run serve
```

Then open <http://127.0.0.1:8080/> in a browser with Memory64 and WebAssembly
threads support. The Dolly server supplies the cross-origin-isolation headers
required for shared Wasm memory; a generic static server is insufficient.

The external SDK wrapper remains useful for bootstrap probes. Linking
automatically validates those results against `dolly-0`:

```sh
./bin/dolly-cc program.c -o build/program.wasm
./bin/dolly-c++ -std=c++23 program.cpp -o build/program.wasm
```

The browser boot path uses the same target shape without a host compiler or
subprocess: the frontend and linker are native code in Dolly's Wasm module and
all compiler I/O is ordinary WasmFS I/O. Separately compiled `/bin/cc` and
`/bin/c++` executables expose that engine through `PATH`:

```sh
cc -Wall -O2 -c first.c -o first.o
cc second.c first.o -o program
c++ -std=c++23 program.cpp -o cpp-program
ld first.o second.o -o object-only-program
ar rcs libfirst.a first.o
cc second.c -L. -lfirst -o archive-linked-program
awk '{count[$1]++} END {for (word in count) print word, count[word]}' input.txt
qjs -e "console.log(6 * 7)"
pi --help
make -j8
zig version
ghostty-vt
```

The driver accepts source, Wasm object, and GNU archive inputs; resolves `-L`
and `-l` with `/usr/lib` as the default library directory; stages intermediate
files under `/tmp`; validates the linked module against the typed `dolly-0`
contract; then ABI-stamps and publishes it. `/bin/ar` creates deterministic GNU
archives with LLVM. The driver deliberately rejects unsupported options;
exceptions and a general build-graph executor are not implemented. `/bin/ld`
exposes the same validated object/archive link path and rejects source inputs.

## Experiment boundary

- One shared wasm64 linear memory and table form the userspace address space.
  The worker loader creates the `WebAssembly.Memory`; all filesystem,
  descriptor, terminal, and lifecycle state stored in it belongs to Dolly.
- Dolly explicitly installs WasmFS's memory backend at `/`; filesystem metadata
  and file contents live in the Wasm address space.
- Side modules are shared-everything dynamic objects, not isolated WASI
  processes.
- Process-shaped execution is a synchronous compatibility abstraction. Dolly
  prefers serial calls and in-memory spooling; multiprocessing, async
  execution, and performance optimization are not version-0 goals.
- Native process and raw-socket APIs are mapped to typed in-Wasm stubs that
  return `ENOSYS`; they never fall through to the browser or host.
- Browser code may fetch immutable startup assets and instantiate a compiled
  module because core WebAssembly cannot do either operation itself.
- JavaScript-backed WasmFS hooks are retained only for output character devices;
  they are not mounted as Dolly's root filesystem. Stdin, foreground routing,
  canonical input, pipes, and EOF behavior are implemented in Wasm.
- Native host files, native processes, and a JavaScript VFS are out of scope.

See [docs/architecture.md](docs/architecture.md) for the proposed ABI direction
and compatibility milestones, and [docs/security.md](docs/security.md) for the
containment and egress model. [docs/sources.md](docs/sources.md) is the inventory
of every external source, host-preparation step, packaged input, and resulting
in-Wasm library or executable.
