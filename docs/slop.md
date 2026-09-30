# Slop and commands

Slop ([`slop.c`](../src/slop.c)) is Dolly's finite shell: enough to run agent
tools, scripts and GNU Make recipes. It is an ordinary process at `/bin/slop`
(`/bin/sh` links to it from `system-tools`). It is not POSIX `sh` or Bash; the
`help` command lists what it supports.

## Invocation

```text
slop [-enux]                              interactive on a terminal, else reads stdin
slop [-enux] -c 'command' [name [arg ...]]
slop [-enux] script [arg ...]
```

- `-e` errexit, `-n` parse only, `-u` nounset, `-x` trace; letters combine.
- The interactive line editor has cursor keys, history, Tab completion of
  commands and paths, Home/End, Ctrl-A/E/U/K/L and Ctrl-R search. History is the
  plain file `$HISTFILE` (default `/home/dolly/.slop_history`, 1,000 entries).
- `PATH` defaults to `/bin:/usr/bin`. Lookup finds regular files; execute bits
  are ignored. Each tool is a separate executable.

## Language

| Area | Supported |
| --- | --- |
| Lists | newline, `;`, `&&`, `\|\|`, `!`; `&` is an error (no background jobs) |
| Compound | `if`/`elif`/`else`, `for`, `while`, `until`, `case`, `break N`, `continue N`, `NAME () { …; }` with `local` and `return` (depth 64), `{ …; }`, `( … )` |
| Redirections | descriptors 0–9: `<`, `>`, `>>`, `n>&m`, `n<&m`, `n>&-`, `>&$fd`, `&>`, `&>>`, `>&file`; redirection-only `exec`; up to 32 `<<` here-documents per line; on compound commands too |
| Parameters | `$VAR`, `${VAR}`, `$?`, `$$`, `$#`, `$-`, `$0`–`$9`, `$@`, `$*`, `"$@"` |
| Expansions | `${VAR-w}`, `=`, `+`, `?` and their `:` forms; `${#VAR}`; `#`, `##`, `%`, `%%`; `$(…)`; simple backticks; `$((…))` in signed 64-bit; `*`, `?`, `[…]` globs; leading `~`; `IFS` splitting of unquoted expansions |
| Builtins | `: . source eval exec exit return cd export unset set shift read getopts local type break continue` |
| Options | `set -e -u -x`; `set -o NAME` for errexit, nounset, pipefail and xtrace; combined as in `set -euo pipefail` |

- Expansion happens when a command runs, so `x=1 && echo "$x"` prints `1`.
- Only inherited, `export`ed or prefix-assigned variables reach children.
- An assignment-only command returns the last substitution's status, so
  `set -e; x=$(exit 7)` stops with 7.
- Command substitutions and `( … )` keep cwd, variables and `exit` private; file
  changes are shared. No process is created for them.
- `set -u` rejects unset parameters except `$@` and `$*`; bare names in `$((…))`
  still read as 0.
- `. FILE ARGS` restores the caller's positional parameters afterwards, even
  after `set --`.
- Not implemented: aliases, job control, `${VAR:off:len}`, `${VAR/pat/rep}`,
  `<<-`, `"prefix$@"` word forms. Features are added only when a useful source
  build needs them and their semantics stay explicit.

## Pipelines and interrupts

- Every pipeline stage is a subshell. A stage that is a literal external command
  runs as its own process and streams through a kernel pipe, so `make | tee log`
  shows progress and `find / | head` stops early (the writer gets `SIGPIPE`).
- A stage that runs inside Slop (builtin, function, compound command, computed
  command name) writes to an unlinked spool file before the next stage starts.
  Command substitutions and here-documents use the same spool.
- The pipeline's status is the last stage's, or with `pipefail` the rightmost
  failing one. Lists run one command at a time.
- Ctrl+C interrupts the foreground command (status 130) and stops the rest of the
  list, pipeline or substitution; an ordinary `exit 130` does not. See
  [process model](process-model.md#signals).

## Commands

- File and text utilities are unchanged upstream sbase, built by its own Makefile
  ([`sbase.dm`](../modules/sbase.dm)). They follow POSIX, not GNU: `cat -n` and
  `ls --color` fail. `install` is sbase `xinstall`; `[` is `test`. `ln -s` works;
  hard links fail in WasmFS. Owners are numeric.
- Commands that need spawn or Dolly specifics are Dolly's own
  ([`agent-tools.dm`](../modules/agent-tools.dm),
  [`core-tools.dm`](../modules/core-tools.dm); sources in `src/commands/`):
  `command`, `env`, `find`, `time`,
  `timeout`, `xargs`, `realpath`, `diff` and `patch` (over Git), `hostname`, `tty`,
  `foreground`, `help`, `clear`, `stat`, `file`. Each prints its supported subset
  with `--help`; other options fail. `uname` and `hostname` report the fixed
  Dolly/wasm64 identity, never the browser's.
- GNU Make 4.4.1 ([`make.dm`](../modules/make.dm),
  [`make-dolly.c`](../src/runtimes/make-dolly.c)) uses `/bin/slop` for every
  recipe and `$(shell …)`; `-jN` is accepted and runs serially. `ninja` is
  Samurai, also serial ([`ninja.dm`](../modules/ninja.dm)).
- `cc`, `c++`, `ld` and `ar` are the private compiler
  ([process model](process-model.md#executables)); `git`, `curl` and `gzip` are
  source-built.
