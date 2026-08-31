# Slop: the compatibility shell

Slop is Dolly's deliberately finite shell language. Its purpose is not to
reproduce a Linux login shell. It provides the smallest useful command
contract for building and running agent tools, especially GNU Make recipes,
inside Dolly's one browser-contained Wasm machine.

This distinction is central to the experiment. Existing agent harnesses are
often specified as “Node on something Linux-like,” which leaves the actual
filesystem, process, shell, and network contracts implicit. Slop makes the
shell portion inspectable: supported syntax has simple synchronous semantics;
unsupported syntax fails instead of escaping to a host shell.

## Executable and lifecycle

`src/slop.c` is compiled by Dolly's in-Wasm C compiler at bootstrap and
published as the ordinary executable file `/bin/slop`. The runtime does not
contain a second hidden command interpreter. It starts `/bin/slop` through the
same filesystem-module loader used for every other command.

Slop has three entry modes:

```text
slop
slop [-e] -c 'command' [name [arg ...]]
slop [-e] script [arg ...]
```

The no-argument form is interactive. GNU Make uses `/bin/slop -c`. Script mode
reads a file from WasmFS. All modes use the same parser and executor.

The interactive form has a deliberately small line editor inside Slop. Left
and Right move the cursor, Up and Down browse command history, and Tab completes
commands from `PATH` or files from the shared filesystem. Home/End, Delete,
Ctrl-A/E, Ctrl-U/K, Ctrl-L, and a simple repeated Ctrl-R substring search are
also supported. Completion is intentionally limited to ordinary unquoted words;
it does not attempt to reproduce a programmable Bash completion framework.

History is userspace state, not browser state. Slop loads and appends the plain
newline-delimited file named by `HISTFILE`, which defaults to
`/home/dolly/.slop_history`. It retains the latest 1,000 entries for interactive
navigation while leaving the file directly inspectable by ordinary tools, for
example `grep zig "$HISTFILE"`. Consecutive duplicate and blank commands are
not appended. Like conventional shell history, commands containing credentials
will be recorded; applications reading credentials from their own stdin are
outside the shell editor and are not.

The shell initializes `PATH=/bin:/usr/bin`. A command containing `/` is opened
directly; every other utility is resolved by searching `PATH` for a regular
file. Dolly has no user or permission model, so discovery has no execute-bit or
`chmod` check. Each executable is a distinct wasm64 dynamic module—there is no
multicall switch on `argv[0]`.

## Deliberately small language

The current language supports:

- commands separated by newline or `;`, with `&&`, `||`, and `!` status logic;
- serial pipelines of any length with `|`;
- single and double quotes, backslash escapes, and boundary comments with `#`;
- `<`, `>`, `>>`, `2>`, `2>>`, and `2>&1` redirections;
- `$VAR`, `${VAR}`, `$?`, `$$`, `$#`, `$0` through `$9`, `$@`, and `$*`;
- `$(command)` substitution with trailing newlines removed;
- deterministic `*`, `?`, and bracket globbing in one path component;
- persistent assignments, command-prefix assignments, `export`, and `unset`;
- `set -e`/`set +e` and command tracing with `set -x`/`set +x`; option letters
  may be combined, as in `set -ex`.

Only state that must affect the current interpreter is built in: `:`, `exit`,
`cd`, `export`, `unset`, and `set`. Utilities such as `echo`, `pwd`, `cat`,
`grep`, `awk`, `cc`, and `make` are executable files found through `PATH`.
`/bin/cd` still exists as a standalone compatibility command, but an unqualified
`cd` is necessarily the stateful builtin.

The current subset does not implement functions, aliases, `eval`, sourcing,
here-documents, background jobs, job control, `if`, `case`, `for`, `while`, or
POSIX parameter operators such as `${x:-default}`. Those are added only when a
useful source build demonstrates a need and the semantics can remain explicit.
Slop is therefore not advertised as POSIX `sh` or Bash.

Ordinary variable expansion currently occurs while a complete submitted line
or script is tokenized. Consequently, a variable changed by an earlier command
in the same parsed text is not re-expanded for a later command. `$?` is the
deliberate exception: Slop marks it during tokenization and expands it when
each simple command begins, so `false; test $? -eq 1` observes the preceding
status. `!` is parsed as pipeline status inversion only at a command boundary;
inside `/bin/[ ! -d path ]` it remains an argument to the separately compiled
test command. Broader deferred expansion remains an explicit compatibility gap
rather than hidden POSIX behavior.

## Synchronous semantics

Dolly version 0 intentionally has no multiprocessing goal. `spawn` invokes one
filesystem module synchronously and `wait` retrieves its completed status.
Slop implements pipelines by running each stage in order and spooling bytes
through an unlinked temporary WasmFS file. Command substitution uses the same
pattern. Temporary names disappear immediately; their open descriptors and
contents remain entirely inside Wasm memory until closed.

This is slower and differs from concurrent Unix pipes under streaming or
unbounded workloads. It is the preferred compatibility rule for now: bounded
compiler recipes and agent utilities behave predictably without inventing
threads, host processes, async JavaScript callbacks, or a scheduler. `-jN` is
similarly accepted by Dolly's GNU Make port but clamped to one effective job.

A trailing consumer such as `head -20` therefore cannot terminate an unbounded
producer through `SIGPIPE`: the producer must finish before `head` starts.
Plain `Ctrl+C` instead targets the currently running foreground command through
Dolly's cooperative `SIGINT` path and returns status 130, leaving Slop and the
shared in-memory filesystem alive.

Language runtimes can also use `dolly_spawn_timeout` to place an inherited
deadline around a synchronous Slop invocation. Pi's shell tool always supplies
an empty finite stdin spool and a 60-second deadline: commands that read stdin
see EOF instead of taking over Pi's terminal, and instrumented C/C++ or
QuickJS loops return status 124. Interactive `!` commands deliberately retain
the terminal. These checks are cooperative; a foreign module without Dolly
safepoints still requires whole-worker replacement for a hard stop.

## GNU Make

GNU Make 4.4.1 is fetched from its checksum-pinned official release, prepared
as an auditable source manifest, fetched by a Dollyfile `SOURCE` row, extracted
by the source-built `/bin/tar`, and compiled into `/usr/bin/make` inside the
browser. The C Dollyfile engine prints each `RUN`/`CHECK` row and stops at the
first failure. Later rows invoke `/usr/src/dolly/startup.mk` for zlib and the
other non-seed tools. The port uses Make's
remote-job adapter as a narrow synchronous execution seam:

- Make's default `SHELL` is `/bin/slop`;
- every recipe, including Make's shell-free fast path, passes through Slop;
- `$(shell command)` runs through Slop and captures an unlinked WasmFS file;
- job completion is reported immediately through Make's existing job logic;
- no `fork`, host process, worker pool, browser shell, or raw socket is used.

The browser acceptance test exercises `SHELL`, `$(shell pwd)`, dependency
ordering, separate C compilation, linking, execution, `-j8` serial clamping,
and an up-to-date rebuild using a real Makefile.

## Browser boundary

Slop, Make, commands, descriptors, cwd, environment, terminal parsing, glyph
rasterization, and mutable files are all inside the Wasm runtime. The browser
forwards bounded input records, blits a checked RGBA frame to Canvas, and owns
the separately documented HTTP broker; it does not parse commands or provide a
filesystem or process implementation. The worker remains blocked in the typed
`int dolly_shell_run(void)` runtime export while the interactive Slop
executable reads the in-Wasm terminal device.

The acceptance proof injects real Ghostty terminal input and verifies the same
path used by a person. Emscripten's `window.prompt` stdin fallback is absent.
