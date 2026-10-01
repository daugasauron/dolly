# Slop and commands

Slop ([`slop.c`](../src/slop.c)) is Dolly's finite shell: enough to run agent
tools, scripts and GNU Make recipes. It is an ordinary process at `/bin/slop`,
compiled by [`Dollyfile-system-build`](../Dollyfile-system-build) with `COMPILEC` in `system-build`
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
  plain file `$HISTFILE` (default `/home/dolly/.slop_history`); the editor
  keeps its last 1,000 entries.
- `PATH` defaults to `/bin:/usr/bin`. Lookup finds regular files; execute bits
  are ignored. Each tool is a separate executable.

## Language

| Area | Supported |
| --- | --- |
| Lists | newline, `;`, `&&`, `\|\|`, `!`; `&` is an error (no background jobs), so `$!` is never set |
| Compound | `if`/`elif`/`else`, `for`, `while`, `until`, `case`, `break N`, `continue N`, `NAME () { …; }` with `local` and `return` (depth 64), `{ …; }`, `( … )` |
| Redirections | descriptors 0–9: `<`, `>`, `>>`, `n>&m`, `n<&m`, `n>&-`, `>&$fd`, `&>`, `&>>`, `>&file`; redirection-only `exec`; up to 32 `<<` here-documents per line; on compound commands too |
| Parameters | `$VAR`, `${VAR}`, `$?`, `$$`, `$#`, `$-`, `$0`–`$9`, `$@`, `$*` (joined with the first `IFS` byte), `"$@"` and `"${@}"` as whole words |
| Expansions | `${VAR-w}`, `=`, `+`, `?` and their `:` forms; `${#VAR}`; `#`, `##`, `%`, `%%`; `$(…)`; simple backticks; `$((…))` in signed 64-bit; `fnmatch` patterns (`*`, `?`, `[…]`, `[[:class:]]`) in globs, `case` and pattern removal; leading `~`; `IFS` splitting of unquoted expansions |
| Builtins | `: . source eval exec exit return cd export unset set shift read getopts local type command break continue` |
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
- Functions take precedence over regular builtins such as `cd`; the special
  builtins (`:`, `.`, `eval`, `exec`, `exit`, `export`, `return`, `set`,
  `shift`, `unset`, `break`, `continue`) always run.
- `cd` without an operand needs `HOME`; an empty operand is a no-op.
- Not implemented, and rejected explicitly: aliases, job control, `$'...'`,
  `${VAR:off:len}`, `${VAR/pat/rep}`, `<<-`, `"prefix$@"` word forms. Features
  are added only when a useful source build needs them and their semantics
  stay explicit.

## Serial pipelines and interrupts

Serial execution is intentional: Slop runs one command at a time, without
threads, host processes or a scheduler.

- Every pipeline stage is a subshell, whatever it runs: an external command, a
  builtin, a function or a compound command. A stage runs to completion before
  the next one starts and reads its output from an unlinked spool file. Command
  substitutions and here-documents use the same spool.
- Unlike concurrent Unix pipes, `make | tee log` shows output only once Make
  finishes, and a consumer such as `head` cannot stop an unbounded producer:
  `seq 1 999999999 | head` runs until `seq` finishes or Ctrl+C stops it.
- The pipeline's status is the last stage's, or with `pipefail` the rightmost
  failing one.
- Ctrl+C interrupts the foreground command (status 130) and stops the rest of the
  list, pipeline or substitution; an ordinary `exit 130` does not. A loop of
  builtins stops too: the shell asks the kernel for SIGINT every 64 commands.
  At the prompt Ctrl+C is input that discards the line. See
  [process model](process-model.md#signals).

## Commands

- Core tools are Dolly's own ([`Dollyfile-system-build`](../Dollyfile-system-build)),
  compiled with plain `cc` in `system-build` before Make, whose recipes need `cp`:
  `cat [-n]`, `cp`, `mv`, `ls [--color]`, `echo`, `touch`, `pwd`, `mkdir`, `rm`,
  `test`/`[` with `!`, `-a`, `-o` and parentheses, `foreground`, `help`, `clear`,
  `stat`, `file`.
  There are no permission bits: `test -x` means a regular file, `-r`/`-w` that
  the path exists. `/bin/cd` is a compatibility command; plain `cd` is the builtin.
- [`Dollyfile-system-tools`](../Dollyfile-system-tools) (sources in `src/commands/`) adds
  `command`, `env`, `find`, `time`, `timeout`, `xargs`, `diff` and `patch` (over
  Git), which run programs with Slop's descriptors; `install`, whose mode, owner
  and group options are syntax only and create no metadata; `tail`, which rejects
  follow mode; `du`, which counts logical in-memory bytes; UTF-8 `rev`;
  `realpath`, `hostname`, `tty`. Each prints its supported subset with `--help`;
  other options fail.
- The other file and text utilities are unchanged upstream sbase, built by its
  own Makefile in `system-tools` ([`Dollyfile-system-tools`](../Dollyfile-system-tools)). They follow
  POSIX, not GNU. `ln -s` works; hard links fail in WasmFS.
- `uname` and `hostname` report the fixed Dolly/wasm64 identity, never the
  browser's.
- GNU Make 4.4.1 ([`Dollyfile-system-build`](../Dollyfile-system-build)) defaults to
  `SHELL=/bin/slop` and starts recipes with `posix_spawn`. `-jN` runs N jobs at
  once and shares a pipe jobserver with recursive Makes. `-O` still groups each
  target's output but warns that it has no lock (`F_SETLKW` is `ENOTSUP`).
  `ninja` is Samurai, which still runs one job ([`Dollyfile-system-tools`](../Dollyfile-system-tools)).
- `cc`, `c++`, `ld` and `ar` are the private compiler
  ([process model](process-model.md#executables)); `git`, `curl` and `gzip` are
  source-built.
