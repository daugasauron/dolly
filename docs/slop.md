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

Expansion currently occurs while a complete submitted line or script is
tokenized. Consequently, a variable or `$?` changed by an earlier command in
the same parsed text is not re-expanded for a later command. Make invokes one
recipe command at a time, so the accepted build path does not depend on that
ordering. It remains an explicit compatibility gap rather than hidden POSIX
behavior.

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

## GNU Make

GNU Make 4.4.1 is fetched from its checksum-pinned official release, prepared
as an auditable source manifest, packaged into `/usr/src/make`, and compiled by
`/etc/dolly/startup.slop` into `/usr/bin/make` during browser bootstrap. The
startup script uses `set -ex`, so every top-level initialization/build command
is visible and any failure stops bootstrap. It then invokes the packaged
`/usr/src/dolly/startup.mk` graph for zlib and the other non-seed tools. The port uses Make's
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

Slop, Make, commands, descriptors, cwd, environment, and mutable files are all
inside the Wasm runtime. The browser supplies terminal rendering/input delivery
and the separately documented HTTP broker; it does not parse commands or
provide a filesystem or process implementation. The worker remains blocked in
the typed `int dolly_shell_run(void)` runtime export while the interactive
Slop executable reads the in-Wasm terminal device.

The acceptance proof injects real Ghostty terminal input and verifies the same
path used by a person. Emscripten's `window.prompt` stdin fallback is absent.
