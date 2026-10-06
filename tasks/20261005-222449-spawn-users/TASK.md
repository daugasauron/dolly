# Investigate: which executables start other processes

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,process,host-modules,investigation

Owner direction (2026-10-06): investigate subprocesses as a declared host
module. Dolly has no fork; the module would be starting, waiting for and
signalling other processes (SPAWN, WAIT, INFO, SIGNAL: 4 of 55 operations,
about 500 kernel and 150 supervisor lines, measured in
`20261002-073000-runtime-process-modules`).

## Question

How many programs actually start another process, and can an executable say
so the way `-pthread` says `threads@0`?

## Measure

- Make the spawn client its own archive member of the process libc
  (`posix_spawn`, `system`, `popen`, `dolly_spawn*`, `wait*`, `kill` of other
  pids) that stamps a host record when linked, on a scratch branch. Rebuild
  the `default` chain and two demo chains, then count per image the
  executables that carry the record and those that do not. Expect Slop, Make,
  Git, `foreground`, `dollyfile`, `amy`, `xargs`, CPython, Pi's Janis and the
  editors to carry it; the open question is everything else.
- Check which callers pull the member in only through libc internals
  (`wordexp`, `popen` behind an unused path) and whether those can fail
  explicitly instead.
- The same technique answers the review's unmeasured candidate: count the
  executables that link the DSO and FFI client (expected: CPython, Neovim)
  and the trusted JavaScript every other process would stop loading
  (`src/process-ffi.mjs`, the DSO half of `src/process-worker.mjs`).

## Done when

- A table per image (executables with and without spawn; with and without
  DSO/FFI) is recorded here with the branch that produced it, and a
  recommendation for each module: contract contents, what stays in the
  runtime (process table, EXIT, self-signals, the ENTRY process), and the
  cost in recipes that must declare it. The owner decides; implementation
  is its own task.

Related: `20261005-222449-single-program-images` (what omitting it needs),
`20261005-222057-explicit-runtime`.

## Measurements (2026-10-06, `investigate/spawn`)

Measured on the sealed release `work/round2/build/releases/current` (build
`5439ebe7`, 61 images, the line before the seed round). Nothing was built, so
the scratch-branch archive member this task proposed was replaced by reading
the linked executables. The static part takes 8 s
([`scan-release.mjs`](scan/scan-release.mjs), [`wasm-ops.mjs`](scan/wasm-ops.mjs),
[`report.mjs`](scan/report.mjs)):
`node scan/scan-release.mjs RELEASE/dist OUT && node scan/report.mjs OUT`.

### Method and its limits

- Static. Every Wasm file in every image's snapshot packs is decoded (151
  distinct files, 136 of them executables). For each call of the
  `dolly_process_0.call` import the scanner walks the operand stack back to the
  instruction that produced the operation number, following wrapper functions.
  Every call site in all 136 executables resolved to a constant, and the import
  is in no function table, so "operation 64 is in this executable" is exact.
  135 of them carry a name section (the compiler does not), which names the
  function that keeps each client.
- What that signal is: the operation is reachable after the linker's garbage
  collection. It is not "the client object is in the link": `cc` links
  `libdolly-process.a` with `--whole-archive` (`src/compiler.cpp:814`), so that
  is true of all 136 and says nothing. `spawn_mapped`
  (`src/process/runtime-adapter.c:35`) is the only SPAWN call site and survives
  only when something references `posix_spawn`, `system`, `popen` or
  `dolly_spawn*`. A stamp from a separate archive member would be carried by
  the same executables plus any whose only reference is in code the linker
  later drops; that superset needs a seed rebuild and was not measured.
- The four `-rdynamic` executables (`python`, `nvim`, `lua`, `rustc-real`)
  export every symbol, `dolly_process_call` included, so every client is kept
  in them by construction. All four have a real use for spawn (subprocess,
  jobs, `os.execute`, the linker).
- Reachable is not called. A language runtime keeps the client for every
  program it runs: the six copies of the Janis JavaScript runtime (`janis`,
  `pi`, `tsc`, `bhop-agent`, `classicube-agent`, `rts-arena`, 1.35 MB each)
  count as spawn users whatever their script does. The dynamic run below
  separates those.
- Not covered: the 14 `#!` scripts in `bin` directories (they run under Slop,
  Janis or CPython, which are counted), programs an image compiles at run
  time, and build inputs under `dist/static` that no image retains.

### Which executables can start a process

43 of 136 executables (32%) reach SPAWN; 93 cannot. Per image: the median
runnable image has 97 executables, 24 with spawn and 73 without.

| How spawn is reached | Count | Executables |
| --- | --- | --- |
| Dolly's own tools, `dolly_spawn*` | 12 | `slop` `foreground` `dollyfile` `amy` `command` `env` `find` `xargs` `time` `timeout` `diff` `patch` |
| Toolchain | 7 | `cc` `c++` `ld` `ar` (proxies), `compiler`, `dolly-rust-link`, the `codex` launcher |
| Ports that call `dolly_spawn*` | 5 | `git` `git-remote-http` `git-remote-https` `ninja` `cmake` |
| Upstream `posix_spawn` | 6 | `make` `emacs` `fd` `rg` `patti` `codex` |
| Upstream `system`/`popen` only | 2 | `awk` (`system()`, pipes), `etags` (compressed files) |
| Language runtime (Janis) | 6 | `janis` `pi` `tsc` `bhop-agent` `classicube-agent` `rts-arena` |
| `-rdynamic`, everything kept | 4 | `python` `nvim` `lua` `rustc-real` |
| A game that runs commands | 1 | `slopyard` (`system`, `dolly_spawn*`) |

- No executable pulls spawn in through a libc internal: `wordexp` is in none,
  and libc's `fork`/`exec*` (kept in 14) never reach SPAWN; they fail.
- Without spawn: 71 of the 88 commands in `/bin`, `curl`, `gzip`, `protox`, the
  TableGen tools, `dolly-llama`, and every display program except `slopyard`
  (`fluid`, `bhop`, `bhop-viewer`, `classicube`, `classicube-viewer`,
  `rts-viewer`, `seven-kingdoms`, 0 A.D.'s `pyrogenesis`).
- `zig` reaches WAIT and SIGNAL but not SPAWN: Zig's standard library forks,
  so it cannot start a child here.
- INFO (67) is not a spawn operation: it is `getpid`, reached by 133 of 136.
  SIGNAL (68) to another pid is reached by 21, of which 19 also spawn; the two
  others are `kill` and `zig`. `raise` and `kill(getpid())` never enter the
  kernel (`src/process/signal.c:105`, `src/process/libc-adapter.c:87`).

### Per image

"Signals others" is SIGNAL to another pid; "DSO client" and "FFI client" are
executables that reach operations 112-114 and 120-123; "DSO files" carry the
`dolly.process.dso` stamp.

| Image | ENTRY | Executables | Spawn | No spawn | Signals others | DSO client | FFI client | DSO files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `amy` | no | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| `audio-sdk`, `classicube-build`, `default`, `gamedev-sdk`, `gpu-sdk`, `rts-build`, `system` | yes | 96 | 23 | 73 | 6 | 0 | 0 | 0 |
| `bhop`, `rts-arena` | yes | 104 | 29 | 75 | 10 | 0 | 0 | 0 |
| `cc` | no | 6 | 6 | 0 | 2 | 0 | 0 | 0 |
| `classicube` | yes | 105 | 29 | 76 | 10 | 0 | 0 | 0 |
| `cmake` | no | 1 | 1 | 0 | 1 | 1 | 0 | 0 |
| `cmake-build`, `llama-build`, `openal-build` | yes | 96 | 24 | 72 | 7 | 1 | 0 | 0 |
| `codex` | yes | 100 | 27 | 73 | 7 | 1 | 0 | 0 |
| `codex-build` | yes | 30 | 10 | 20 | 3 | 1 | 0 | 0 |
| `codex-cli` | no | 4 | 4 | 0 | 1 | 1 | 0 | 0 |
| `core` | no | 19 | 2 | 17 | 0 | 0 | 0 | 0 |
| `curl`, `gzip`, `protox` | no | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| `display`, `minicpm5-2b`, `qwen3.5-2b`, `qwen3.5-800m`, `sdl2`, `zlib` | no | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `dollyfile-studio` | yes | 103 | 29 | 74 | 10 | 2 | 0 | 7 |
| `emacs` | no | 3 | 2 | 1 | 1 | 0 | 0 | 0 |
| `fd`, `ripgrep` | no | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| `ghostty-build` | yes | 27 | 9 | 18 | 3 | 0 | 0 | 0 |
| `gnu-emacs` | yes | 99 | 25 | 74 | 7 | 0 | 0 | 0 |
| `gpu-fluid` | yes | 97 | 23 | 74 | 6 | 0 | 0 | 0 |
| `javascript` | no | 2 | 2 | 0 | 2 | 0 | 0 | 0 |
| `llvm-tablegen` | yes | 100 | 25 | 75 | 8 | 2 | 1 | 1 |
| `local-llm-build` | yes | 97 | 24 | 73 | 7 | 2 | 0 | 0 |
| `minimal` | yes | 19 | 2 | 17 | 0 | 0 | 0 | 0 |
| `neovim` | yes | 97 | 24 | 73 | 7 | 1 | 0 | 7 |
| `neovim-build` | yes | 98 | 26 | 72 | 9 | 3 | 0 | 9 |
| `nvim` | no | 1 | 1 | 0 | 1 | 1 | 0 | 7 |
| `pi`, `pi-runtime` | yes | 101 | 28 | 73 | 9 | 0 | 0 | 0 |
| `pi-build` | yes | 98 | 26 | 72 | 9 | 0 | 0 | 0 |
| `pi-coding-agent` | no | 5 | 5 | 0 | 3 | 0 | 0 | 0 |
| `pi-local` | yes | 102 | 28 | 74 | 9 | 1 | 0 | 0 |
| `python` | no | 1 | 1 | 0 | 1 | 1 | 1 | 1 |
| `rust` | no | 3 | 3 | 0 | 1 | 1 | 0 | 0 |
| `rust-build` | yes | 31 | 12 | 19 | 3 | 1 | 0 | 0 |
| `rust-sdk` | yes | 29 | 11 | 18 | 3 | 1 | 0 | 0 |
| `rust-tools` | yes | 99 | 26 | 73 | 7 | 1 | 0 | 0 |
| `slopyard` | yes | 102 | 29 | 73 | 10 | 0 | 0 | 0 |
| `system-build` | no | 26 | 9 | 17 | 2 | 0 | 0 | 0 |
| `system-tools` | yes | 95 | 23 | 72 | 6 | 0 | 0 | 0 |
| `typescript-build` | yes | 97 | 25 | 72 | 8 | 0 | 0 | 0 |
| `zero-ad` | yes | 97 | 23 | 74 | 6 | 1 | 0 | 0 |
| `zero-ad-deps` | yes | 99 | 24 | 75 | 7 | 1 | 0 | 0 |
| `zero-ad-engine` | yes | 101 | 24 | 77 | 7 | 2 | 0 | 0 |
| `zig-build` | no | 27 | 9 | 18 | 3 | 0 | 0 | 0 |

52 of 61 images hold an executable with the spawn client: all 37 runnable
ones (each enters through `/bin/foreground -i /bin/slop`, both spawn users)
and 15 packages. The nine without are `curl`, `gzip`, `protox` and six images
with no executable at all.

### At run time (34 of the 37 runnable images)

[`scan/measure.mjs`](scan/measure.mjs) puts a proxy in front of the release
that changes one file: the process Worker's `call()` reports each process
start, its argv, every SPAWN and the counts of operations 64, 65, 67, 68,
112-114 and 120-123. Headless Chrome boots one image at a time and stops when
no process has started for 8 s after the page is ready. `fluid` and `slopyard`
ran on SwiftShader WebGPU (they stop after one frame with `--disable-gpu`).
Not run: `dollyfile-studio`, `pi-local` and `zero-ad` (1.4-1.8 GB each, with
3-5 GB of memory free on the machine). Only the boot is covered, not what a
person or an agent does afterwards.

- Every boot spawns: 125 processes and 92 SPAWN calls in 34 images. 86 of the
  125 are `foreground` (47) or `slop` (39), 19 are `test` and `printf` from
  `init.slop` and `~/.dollyrc`, and 20 are the images' programs and what
  those start.
- 24 images (`minimal` and 23 toolchains) are exactly `foreground` and `slop`.
- 81 of the 92 calls come from `foreground` (48) and `slop` (33). The other
  11 come from five programs: `classicube-agent` 5 (viewer, game twice,
  `gzip`, `classicube-pack`), `bhop-agent` 2 (viewer, game), `pi` 2
  (`fd --version`, `rg --version`), `nvim` 1 (`nvim --embed`), `codex` 1
  (the launcher starts the client).
- Programs that started nothing before their first prompt or frame: `fluid`,
  `slopyard`, `emacs` and `rts-arena` (at its menu). `rts-arena` is one of the
  Janis copies: its spawn client is linked and had not been used by then.
- SIGNAL, DSO and FFI at boot: none in any image. The hook does see them:
  in `llvm-tablegen`, `python3 -c "import ctypes"` makes 1 DSO_OPEN and an FFI
  closure, and a `CFUNCTYPE` callback 1 FFI_CALL; in `neovim`, `:help` makes 1
  DSO_OPEN and 1 DSO_SYMBOL in `nvim --embed`, and no FFI.

### What each module would hold (`c12fd897`)

| | `spawn@0` | `dso@0` (DSOs and FFI) |
| --- | --- | --- |
| Operations | SPAWN 64, WAIT 65, SIGNAL 68: 3 of 55 | DSO 112-114, FFI 120-123: 7 of 55 |
| `process.h` (733 lines) | 78: spawn flags, the spawn, mapping, wait and signal packets | 70; `abi/dolly-process-dso-0.wat` is already its own contract |
| `runtime.h` (120 lines) | 43 | 8 |
| Client | 435 lines (`runtime-adapter.c:35-204`, `443-476`, `771-990`, `libc-adapter.c:80-90`) | 182 (`runtime-adapter.c:589-770`); FFI's client is already the demo's (`demos/python/libffi-dolly.c`) |
| Kernel | 46 lines of dispatch (`process-kernel.c:1815-1849`, `1857-1867`) and about 85 in parent and child branches | none: both are served in the process Worker (`process-worker.mjs:428-438`) |
| Trusted JavaScript | about 50 of the supervisor's 748 lines, 2 of its 23 exports | 1,028 lines (`process-worker.mjs:78-412`, `process-ffi.mjs`): 36 KB of the 65 KB bundle every process Worker loads |
| Outer imports | none | none |
| Executables | 43 of 136 | 8 reach an operation, 4 are `-rdynamic` hosts, 1 calls FFI |
| Recipes that declare it | 52 of 61 | 10 of 61 |
| Images that omit it | 9, none runnable | 51: `default`, `minimal`, `system`, every game |

What stays in the runtime with a `spawn@0`: the process table and its 32
slots; `spawn_packet` with image reading, `#!` and descriptor set-up, because
the page starts ENTRY through the same function (`process-kernel.c:1335`,
`process-supervisor.mjs:162`, `runtime-worker.mjs:67`); the supervisor's launch
loop, module cache and retirement; EXIT; INFO; INTERRUPT_POLL,
SIGNAL_ACKNOWLEDGE and the alarms (a process's own signals); and the page's
`dolly_process_signal` for Ctrl+C. The earlier figure (about 500 kernel and 150
supervisor lines) counted that launch path. It does not move.

The DSO users in detail: `nvim` (4 images, 7 parsers), `python` (2 images, 1
extension, the only FFI caller), `lua` (`neovim-build`, 2 modules) and
`rustc-real` (4 images, proc macros built at build time) are `-rdynamic`.
Four more reach an operation without being hosts: `cmake` only `dlsym` (9
images); `dolly-llama` and `pyrogenesis` `dlopen`, in images that hold no DSO
for them; and `codex`, a thread client, where every DSO call already answers
`ENOTSUP` (`process-worker.mjs:429`). Every DSO in the catalog (10 files) is
under `nvim`'s, Lua's or CPython's library directory. A record by reference
instead of by `-rdynamic` would add those four and 12 recipes (22 of 61).
The display plugin (`/usr/lib/libdisplay.so`, in 38 images) is not a user: it
is linked into the kernel at boot by its own 77-line loader and contract
(`src/kernel-plugin.mjs`, `abi/dolly-kernel-plugin-0.wat`) and touches neither
the process DSO loader nor FFI.

## Recommendation

1. `spawn@0`: no. The line would be in 52 of 61 recipes and in all 37
   runnable ones, since each enters through `/bin/foreground -i /bin/slop`; a
   build host would add it as it adds `http@0`, because every `RUN` goes
   through Slop. An image that omitted it would shed no outer import, about
   50 lines of trusted JavaScript and about 130 kernel lines: the one effect
   is a process quota of 1 instead of 32. The price is 121 header lines and
   435 client lines
   moved, a new `dolly.process` digest (every image, package and session
   rebuilt once, the Rust seed too) and a twelfth manifest. The split itself
   is clean (one call site, no unresolved caller), so it can be made later
   without new knowledge. Decide again when single-program images exist in
   number (`20261005-222449-single-program-images`): eight display programs
   in the catalog never start a process, and no image enters one of them
   directly.
2. `dso@0`, holding the DSO loader and FFI: yes, in the next process-ABI
   round (with `20261006-093856-flock-stub`). `cc -rdynamic` links the client
   and its record, as `-pthread` does for `threads@0`; without it `dlopen`
   fails with a message, which takes no DSO in the catalog away from `cmake`,
   `dolly-llama`, `pyrogenesis` or `codex`. 10 recipes declare it, and in the
   other 51 images no process reaches those 1,028 lines of trusted
   JavaScript, 11% of the total (`20260930-100000-audit-24`). It needs one new
   mechanism: the process Worker imports a second bundle before `_start`
   when the image declares the module. No start-up gain is claimed; none was
   measured. FFI as a module of its own would be declared by 2 images and
   costs a second manifest for 693 lines; one module is recommended because
   its only caller needs both.
