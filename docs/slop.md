# Slop and commands

Slop ([`slop.c`](../src/slop.c)) is Dolly's shell: the POSIX shell command
language for scripts and `-c` commands, as far as upstream build scripts and
agents use it. It is an ordinary process at `/bin/slop`,
compiled in `system-build` by a `RUN` of the seed's compiler ([`Dollyfile-system-build`](../Dollyfile-system-build))
(`/bin/sh` links to it from `system-tools`). It is not Bash and not yet all of
POSIX `sh`: this page is what it supports, `help` says what it lacks in every
image, and `man NAME` describes a command.

## Target and boundary

- **Target:** the Shell Command Language of POSIX.1-2024 (XCU chapter 2) as
  scripts and `-c` commands use it. A script written for `sh` should run
  unchanged. POSIX's interactive extras (job control, aliases, `fc`) and every
  Bash, Ksh or Zsh extension are outside it.
- **Corpus:** Slop is measured against two bodies of shell text, and an
  addition comes with a test taken from one of them:
  1. what the catalog runs inside images: recipe `SLOP` lines and scripts, the
     recipes of upstream and generated Makefiles, and upstream build scripts
     such as CMake's `bootstrap`;
  2. what agents type inside Dolly, as recorded in transcripts and audits.
- **A missing feature** is judged in this order:
  1. Not POSIX (`[[ ]]`, arrays, `<( )`, `${VAR/pat/rep}`, `${VAR:off:len}`,
     brace expansion, `function`, `let`): refused, by name where agents are
     known to type it. It is admitted only when an unchanged upstream script of
     the first corpus cannot run without it: that source cannot be changed, an
     agent's command can.
  2. POSIX, but Dolly's process model gives it no meaning (`umask`, `ulimit`,
     an ignored signal, a compound command, builtin, function or `&&` list
     after `&`, which would need a copy of the shell): refused by name with
     the reason.
  3. POSIX and needed by either corpus: a defect to fix.
  4. POSIX and not yet needed: not implemented ahead of need, and it fails
     explicitly instead of being read as something else.
- **Never:** Slop is one process, without threads or a scheduler, and it never
  copies itself. Subshells, substitutions, functions and compound commands run
  inside it, one after another. Only programs, which are separate processes,
  run at the same time.

## Invocation

```text
slop [-efnux]                             interactive on a terminal, else reads stdin
slop [-efnux] -c 'command' [name [arg ...]]
slop [-efnux] script [arg ...]
```

- `-e` errexit, `-f` no pathname expansion, `-n` parse only, `-u` nounset, `-x`
  trace; letters combine.
- The interactive line editor has cursor keys, history, Tab completion of
  commands and paths, Home/End, Ctrl-A/E/U/K/L and Ctrl-R search. History is the
  plain file `$HISTFILE` (default `/home/dolly/.slop_history`); the editor
  and the file keep its last 1,000 entries.
- `PATH` defaults to `/bin:/usr/bin`. Lookup finds regular files; execute bits
  are ignored. Each tool is a separate executable; the shell runs the code of
  `/bin`'s `test`, `[`, `echo`, `printf`, `true` and `false` itself when `PATH`
  finds them there, as other shells have them built in. A name with a slash, one
  found earlier on `PATH` or a background stage starts the program.

## Language

| Area | Supported |
| --- | --- |
| Lists | newline, `;`, `&&`, `\|\|`, `!`; `time PIPELINE` prints `real SECONDS` for any pipeline, compound commands included; `PROGRAM &` and `a \| b &` start programs without waiting, `$!` is the last one's PID, `wait` and `wait PID...` collect them |
| Compound | `if`/`elif`/`else`, `for`, `while`, `until`, `case`, `break N`, `continue N`, `NAME () { …; }` or any other compound command as the body, with `local` and `return` (depth 64), `{ …; }`, `( … )` |
| Redirections | descriptors 0–9: `<`, `>`, `>>`, `n>&m`, `n<&m`, `n>&-`, `>&$fd`, `&>`, `&>>`, `>&file`; redirection-only `exec`; up to 32 `<<` here-documents per line; on compound commands too |
| Parameters | `$VAR`, `${VAR}`, `$?`, `$$`, `$!`, `$#`, `$-`, `$LINENO`, `$0`–`$9`, `$@`, `$*` (joined with the first `IFS` byte), `"$@"` and `"${@}"` as one field per parameter, also inside a word (`"x$@"`) and as `${1+"$@"}` |
| Quoting | `'…'`, `"…"`, backslash, and `$'…'` with the C escapes `\a \b \e \f \n \r \t \v \\ \' \" \cX \xHH \NNN` |
| Expansions | `${VAR-w}`, `=`, `+`, `?` and their `:` forms; `${#VAR}`; `#`, `##`, `%`, `%%`; `$(…)`; simple backticks; `$((…))` in signed 64-bit with C's operators, assignments (`=`, `+=`, …) and `?:` (no `++`, `--` or comma); `fnmatch` patterns (`*`, `?`, `[…]`, `[[:class:]]`) in globs, `case` and pattern removal; leading `~`; `IFS` splitting of unquoted expansions |
| Builtins | `: . source eval exec exit return cd export unset set shift read getopts local type command break continue trap wait` |
| Options | `set -e -f -u -x`; `set -o NAME` for errexit, noglob, nounset, pipefail and xtrace; combined as in `set -euo pipefail` |

- Expansion happens when a command runs, so `x=1 && echo "$x"` prints `1`.
- Only inherited, `export`ed or prefix-assigned variables reach children.
- The shell starts with `IFS` set to space, tab and newline, `OPTIND=1` and
  `PPID`, as POSIX says and dash and Bash do.
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
- `cd` without an operand needs `HOME`; an empty operand is a no-op. `PWD` is
  always the directory's real path, so `cd -P` is what `cd` does and `-L` is
  refused.
- `trap ACTION CONDITION...` handles `EXIT`, `HUP`, `INT`, `QUIT`, `PIPE` and `TERM`.
  A signal's action runs once the current command has finished; `EXIT` runs
  when the shell or a subshell leaves, also after a signal. A subshell starts
  without traps. `trap '' SIGNAL` is rejected: commands always start with
  default signal actions, so an ignored signal could not be inherited.
- Not implemented, and rejected by name: `alias`, `unalias`, `jobs`, `fg`,
  `bg` and a job spec to `kill` (no job control: `kill $!`), `umask` (there are no permission bits), `ulimit` (limits are fixed),
  `${VAR:off:len}`, `${VAR/pat/rep}`, and Bash's `((...))`, `<<<` and
  `<(...)`, which POSIX would read as two subshells, a here-document and a
  redirection.
  As in POSIX `sh`, braces do not expand (`echo {1..3}` prints `{1..3}`) and
  a glob that matches nothing stays as typed. `help` lists the same limits
  inside every image.

## Pipelines and interrupts

The programs of a pipeline, and a program started with `&`, run at the same
time over kernel pipes, the mechanism Make's jobs and `xargs -P` use. Stages
that run inside the shell stay serial.

- Every pipeline stage is a subshell. A stage is a **program** when it is a
  simple command whose expanded name is no function or builtin and is found on
  `PATH`; a builtin, a function or a compound command runs **in the shell**.
- A program is started and not waited for; its output is a 64 KiB kernel
  pipe. `make | tee log` shows output while Make runs, and a consumer that
  stops ends its producer: in `seq 1 999999999 | head -n1`, `seq` dies of
  `SIGPIPE` at its next write.
- A stage in the shell reads a program's pipe while that program runs
  (`make | while read -r line; do ...; done` streams, and leaving the loop
  stops Make), but its own output collects in an unlinked spool file that the
  next stage reads once the stage has finished: nothing would drain a pipe
  while the shell itself writes. So `while :; do echo y; done | head -n1`
  never ends; put the loop in a program, `slop -c '...' | head -n1`. Command
  substitutions and here-documents use the same spool.
- The shell waits for every program of the pipeline. The status is the last
  stage's, or with `pipefail` the rightmost failing one; a producer stopped by
  its consumer counts as failing with 141, as in Bash.
- Stages that write to the terminal interleave in the order their writes reach
  the kernel; each `write` is whole.
- `PROGRAM &` and `a | b &` start programs and continue with status 0; standard
  input is `/dev/null` unless redirected. `$!` is the PID of the last one,
  `wait` collects all of them and `wait PID...` returns the status of the last
  PID named. At most 56 processes exist, 32 of them a shell's background programs, and a background program outlives
  its shell. `ps` lists the ones that run. There is no job control: `jobs`, `fg`, `bg` and `kill %N` are refused,
  and so is `&` after anything the shell would run itself (a compound
  command, a builtin, a function, a `!`, `&&` or `||` list): use
  `slop -c '...' &`. `( PROGRAM ARG... ) &` is the one compound form that
  runs, as `PROGRAM ARG... &`, and `exec PROGRAM ARG... &` runs the same way:
  it replaces the job, not the shell.
- `exec PROGRAM ARG...` replaces the shell with the program, which keeps the
  process, the descriptors, the redirections of the command and the exported
  variables ([exec](process-model.md#exec)); `exec` with only redirections
  keeps them for the shell. A subshell is no process of its own, so in one,
  in a substitution and in a pipeline stage, `exec PROGRAM` runs the program
  and ends the subshell with its status, without the subshell's `EXIT` trap.
  When `exec` fails, a script ends with 127 for a missing program and 126 for
  one that cannot run; the prompt reports the status and goes on.
- Ctrl+C interrupts the foreground command (status 130) and stops the rest of the
  list, pipeline or substitution; an ordinary `exit 130` does not. A loop of
  builtins stops too: the shell asks the kernel for SIGINT every 64 commands.
  At the prompt Ctrl+C is input that discards the line. See
  [process model](process-model.md#signals).

## Commands

- Core tools are Dolly's own ([`Dollyfile-system-build`](../Dollyfile-system-build)),
  compiled with plain `cc` in `system-build` before Make, whose recipes need `cp`:
  `cat [-nu]`, which writes what it reads at once, `cp`, `mv`, `ls [--color]`, `echo`,
  POSIX's `printf`, `touch`, `pwd`, `mkdir`, `rm`, `test`/`[` (up to four arguments decided by
  their number, as POSIX says), `foreground`, `help`, `clear`,
  `stat`, `file`, `sleep` (a decimal number of seconds: `sleep 0.1`).
  There are no permission bits: `test -x` means a regular file or a directory,
  `-r`/`-w` that the path exists. `ls -l` is the POSIX long format: the fixed modes `stat`
  reports, numeric owner and group (there is no name database) and a `total`
  of the listed sizes in KiB (there are no disk blocks).
- [`Dollyfile-system-tools`](../Dollyfile-system-tools) (sources in `src/commands/`) adds
  `command` and `env`, which `exec` the program they name, and `find`, `time`,
  `timeout`, `xargs` (`-P N` runs N commands at once), which run programs
  with Slop's descriptors, as the `git`
  package's `diff` and `patch` do (over Git; the patch names its files, a
  `FILE` operand is rejected); `nproc`, which prints 4, the number of jobs Dolly's own recipes give Make (libc's
  `sysconf` counts threads: 1 without `-pthread`); `install`, whose mode, owner
  and group options are syntax only and create no metadata; `du`, which counts
  logical in-memory bytes; UTF-8 `rev`; `realpath`, `hostname`, `tty`. Each
  prints its supported subset with `--help`;
  other options fail.
- The other file and text utilities are unchanged upstream sbase, built by its
  own Makefile in `system-tools` ([`Dollyfile-system-tools`](../Dollyfile-system-tools)). They follow
  POSIX, not GNU: `dd bs=1024k`, not `bs=1M`. `ln -s` works; hard links fail in
  WasmFS. `command -v NAME` says what runs for a name and ends with 1 when
  nothing does; sbase's `which` ends with 2 then ("not an external command"). `kill` signals any process by PID. There is no
  `chmod`, `chown`, `id`, `whoami` or `df`: one user without modes to
  change or a name database, and no mount list to read; the `ps` package
  prints `/proc/processes`. `tar` only extracts, regular files and directories
  of ustar, pax and GNU archives (what `git archive` and GitHub's tarballs are),
  with their modification times;
  `gzip` stores no name or time (`-n`); Git creates archives of any directory:
  `git init -q . && git add -A && git archive -o out.tar.gz $(git write-tree)`
  (`.tar`, `.tar.gz` and `.zip`).
- `uname` and `hostname` report the fixed Dolly/wasm64 identity, never the
  browser's.
- GNU Make 4.4.1 ([`Dollyfile-system-build`](../Dollyfile-system-build)) defaults to
  `SHELL=/bin/slop` and starts recipes with `posix_spawn`. `-jN` runs N jobs at
  once and shares a pipe jobserver with recursive Makes; `-O` groups each
  target's output.
  `ninja` is Samurai ([`Dollyfile-system-tools`](../Dollyfile-system-tools)), which runs two jobs
  at once unless told `-j N`: libc counts one processor without `-pthread`.
- `cc`, `c++`, `ld` and `ar` are the private compiler
  ([process model](process-model.md#executables)); `git`, `curl` and `gzip` are
  source-built.
- At a terminal `git` and `man` send long output to `$PAGER`, or to `less`
  once it is installed (`amy install less`), and print it otherwise. Output
  that is not a terminal is never paged: a pipe, a file or a tool call gets
  it at once.
