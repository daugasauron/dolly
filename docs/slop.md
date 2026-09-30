# Slop: the compatibility shell

Slop is Dolly's deliberately finite shell language. Its purpose is not to
reproduce a Linux login shell. It provides the smallest useful command
contract for building and running agent tools, especially GNU Make recipes,
inside Dolly's one browser-contained Wasm machine.

## Executable and lifecycle

`src/slop.c` is compiled by Dolly's in-Wasm C compiler at bootstrap and
published as the ordinary executable file `/bin/slop`. The runtime does not
contain a second hidden command interpreter. It starts `/bin/slop` through the
same filesystem-module loader used for every other command.

Slop has three entry modes:

```text
slop [-enux]
slop [-enux] -c 'command' [name [arg ...]]
slop [-enux] script [arg ...]
```

The no-argument form is interactive when standard input is a terminal;
otherwise it reads its complete standard input as a script, so
`echo 'cmd' | sh` works. GNU Make uses `/bin/slop -c`. Script mode reads a
file from WasmFS. All modes use the same parser and executor. `-n` parses
without executing and is useful for checking imported build scripts; `-e`
enables checked execution, `-u` rejects unset parameters and `-x` prints
executed commands. Option letters combine, as in `-ec`.

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
`chmod` check. Tools are distinct private wasm64 executables—there is no
multicall switch on `argv[0]`. A file with a bounded `#!` line instead dispatches
to its absolute interpreter inside WasmFS, which gives Python and future
runtimes conventional script entry points without a host process escape.

## Deliberately small language

The current language supports:

- commands separated by newline or `;`, with `&&`, `||`, and `!` status logic;
  a lone `&` is a syntax error because Slop has no background jobs;
- nested `if`/`then`/`elif`/`else`/`fi` command lists; conditions suppress
  `set -e` while selected bodies retain normal failure behavior;
- finite nested `for NAME [in WORD ...]; do ...; done` loops; an omitted `in`
  list iterates positional arguments, and explicit word lists expand once;
- finite `while CONDITION; do ...; done` and `until CONDITION; do ...; done`
  loops with execution-time condition and body expansion;
- `break [N]` and `continue [N]` loop control, including propagation through
  nested loops; levels larger than the active nesting depth target the
  outermost active loop;
- nested `case WORD in PATTERN[|PATTERN]...) ... ;; ... esac` selection using
  Slop's deterministic wildcard matcher and first-match execution; quoted
  parts of a pattern match literally, as in `"$prefix"*)`;
- named `NAME () { COMMANDS; }` functions with function-local positional
  parameters, scoped `local NAME[=VALUE] ...` variables, `return [STATUS]`, a
  recursion limit of 64 calls, and ordinary current-interpreter
  `{ COMMANDS; }` groups whose trailing redirections wrap the complete group;
- parenthesized `(COMMANDS)` subshells with private cwd, variables, exported
  names, functions, positional/option state, `exec` descriptors and `exit`;
  their file mutations remain in the shared WasmFS and no process is created;
- trailing redirections on every compound command, as in
  `while read -r line; do ...; done < file`;
- pipelines of any length with `|` whose stages, simple or compound, each run
  as a subshell (see [pipelines](#pipelines)); the optional `set -o pipefail`
  returns the rightmost nonzero stage status;
- single and double quotes, backslash escapes, and boundary comments with `#`;
- backslash-newline continuation in scripts and `-c` command text;
- ordered `<`, `>`, and `>>` file redirections for descriptors 0 through 9,
  descriptor duplication and closing with forms such as `2>&1`, `6>&1`,
  `7<&0`, and `5>&-`, execution-time descriptor words such as `>&$fd` that
  must resolve to exactly one digit or `-`, and persistent descriptor setup
  through redirection-only `exec`; Bash's `&>file`, `&>>file` and `>&file`
  send both stdout and stderr to the file; child commands inherit descriptors
  0 through 9 exactly, including closed ones;
- up to 32 `<<DELIMITER` here-documents on one command line; literal quoted
  delimiters suppress expansion, while unquoted bodies expand parameters,
  arithmetic, command substitutions, and simple legacy backticks at execution
  time; tab-stripping `<<-` is deliberately not part of this finite form;
- `$VAR`, `${VAR}`, `$?`, `$$`, `$#`, `$-`, `$0` through `$9`, `$@`, and
  `$*`; exact quoted `"$@"` words preserve every positional argument and empty
  field, while `$-` reports Slop's active `e`, `i`, `n`, `u`, and `x` flags;
- the finite `${VAR-word}`, `${VAR=word}`, `${VAR+word}`, and `${VAR?message}`
  default/assignment/alternate/error forms, plus their colon variants
  `${VAR:-word}`, `${VAR:=word}`, `${VAR:+word}`, and `${VAR:?message}`;
  the colon variants also select empty values, and selected words support
  nested dollar expansion; any expansion error, including `${VAR?}` and
  arithmetic errors, exits a non-interactive shell with status 1;
- byte length with `${#VAR}` and shortest/longest wildcard prefix or suffix
  removal with `${VAR#pattern}`, `${VAR##pattern}`, `${VAR%pattern}`, and
  `${VAR%%pattern}`;
- `$(command)` and simple legacy `` `command` `` substitution with trailing
  newlines removed; nested substitutions use the modern `$()` form rather
  than the ambiguous escaped-backtick syntax;
- signed wasm64 `long` arithmetic expansion with `$((expression))`, including
  variables, parentheses, unary, multiplicative, additive, shift, comparison,
  equality, bitwise, and short-circuit logical operators; evaluated division
  errors fail expansion;
- deterministic `*`, `?`, and bracket globbing in every path component, as in
  `rm -f build/*/*.o`;
- execution-time `~` expansion at the start of a fully unquoted word or the
  value of an assignment, using the current `HOME`; named-user forms are not
  part of Dolly's no-user-model shell;
- persistent and command-prefix assignments, performed from left to right so
  `a=x b=$a` sets `b` to `x`; only variables inherited from the environment,
  marked with `export`, or assigned as a command prefix reach child commands;
  `export` or `export -p` lists them and `unset` also drops the mark;
- sorted shell-state output from bare `set`, positional replacement with
  `set [--] ARG ...`, and checked `shift [N]`;
- line input with `read [-r] [NAME ...]`; it assigns shell state, honors `IFS`
  for deterministic basic field splitting, and consumes exactly one line so
  the next reader of the same file or pipe continues after it;
- deterministic `IFS` byte splitting for fully unquoted expansion words,
  including empty-field removal and globbing after splitting; literal words
  are not split merely because they contain an `IFS` byte, and quoted or
  mixed-quoted words remain one field; assignment words passed to `local` and
  `export` retain one value without splitting or globbing;
- finite short-option parsing with `getopts OPTSTRING NAME [ARG ...]`, including
  clustered options, required arguments, `OPTIND`, `OPTARG`, explicit argument
  lists, and the leading-colon error convention;
- current-interpreter script loading with `. PATH [ARG ...]` or its `source`
  alias; names without a slash are resolved through `PATH`, and supplied
  arguments temporarily become the sourced script's positional parameters.
  Without explicit arguments, `set --`/`shift` update the caller's parameters.
  With explicit arguments, Dolly always restores the caller's frame, including
  after `set --`, errors, or `return`; this differs from Bash's top-level behavior
  after `set --`. `return` exits only the innermost sourced
  script or function, not its caller;
- `eval [WORD ...]`, which joins its already-expanded arguments with spaces and
  parses the result in the current interpreter;
- `set -e`/`set +e`, `set -u`/`set +u`, command tracing with
  `set -x`/`set +x`, and named `set -o`/`set +o` options for `errexit`,
  `nounset`, `pipefail`, and `xtrace`; other options fail with status 2;
  letters combine, as in `set -euo pipefail`. Under `set -u`, expanding an
  unset parameter other than `$@` and `$*` is an expansion error, while the
  `-`, `=`, `+` and `?` forms still select their words; bare names inside
  `$((...))` still read as 0, as in POSIX;
- state-aware `type [-p|-P] NAME ...`, which can distinguish Slop functions,
  builtins, filesystem executables, and missing commands.

Only state that must affect the current interpreter is built in: `:`, `.`, `source`,
`eval`, redirection-only `exec`, `return`, `exit`, `cd`, `export`, `unset`, `set`, `shift`, `read`,
`getopts`, `local`, `type`,
`break`, and `continue`. Utilities such as `echo`, `pwd`, `cat`,
`grep`, `awk`, `cc`, and `make` are executable files found through `PATH`.
There is no `/bin/cd`; `cd` is only the stateful builtin.
The builtin `cd [--] [DIRECTORY]` updates `PWD` and `OLDPWD`; `cd -` returns to
and prints the previous directory. These variables are restored with the cwd
across a parenthesized group or command substitution.

The file and text utilities are unchanged upstream sbase commands built by
sbase's own Makefile in `system-build` (`modules/sbase.dm`); `install` is sbase's
`xinstall` and `[` links to `test`. They follow POSIX rather than GNU, so for
example `cat -n`, `ls --color`, and `test` with more than four arguments
(`-a`, `-o`, parentheses) fail. Symbolic links work, but WasmFS's current
`linkat` rejects hard links, so plain `ln` fails while `ln -s` works. Dolly has
no user database: owners print numerically and `install -o/-g NAME` fail.

sbase commands which fork cannot run here, so Dolly owns `command`, `env`,
`find`, `time`, `timeout`, and `xargs`. They resolve programs on `PATH` and run
them through the same in-Wasm spawn/wait lifecycle as Slop. `xargs` batches
input by `-n` count and `-s` bytes (128 KiB by default) and accepts only
`-P 1`. `find` walks sorted entries without following symlinks and supports the
common name/path/type/empty, depth, prune, print, and exec subset;
user/group/permission predicates fail. `timeout` uses the runtime deadline
(status 124; a duration of 0 disables it), and `time` reports monotonic elapsed
time. `hostname`, `tty`, `stat`, and `file` report Dolly's fixed identity,
terminal, metadata, and formats without asking the browser.
Standard `printf` rules still apply: `%s` does not interpret backslash
escapes in an argument, so agents should use the Pi write tool for multiline
source and Makefiles rather than assembling them with fragile shell quoting.
`diff` and `patch` reuse source-built Git's `diff --no-index` and `apply`.
`diff` accepts `-abNqrw`, `-u`, and `-U N`, exits 0, 1, or 2 like POSIX diff,
and prints Git-style unified output; other options fail. `patch` reads the
patch from stdin or `-i` and applies it to the files it names; a FILE operand
fails.

The current subset does not implement aliases, background jobs, job control,
parameter substring slicing, or search-and-replacement.
Those are added only when a useful source build demonstrates a need and the
semantics can remain explicit.
Slop is therefore not advertised as POSIX `sh` or Bash.

Dollar expressions are length-framed during tokenization and expanded only
when their simple command is reached. Thus `x=value && test "$x" = value` and
`echo value > file && test "$(cat file)" = value` observe the earlier command,
while escaped or single-quoted dollars remain literal. `$?` uses the same
execution-time rule, so `false; test $? -eq 1` observes the preceding status.
Substitutions update status as they execute; later `$?` expansions see that
status. An assignment-only (or redirection-only) command returns the last
substitution's status, or zero if none ran. Thus `set -e; x=$(exit 7)` stops
with status 7. An ordinary command still supplies its own status:
`: $(exit 7)` succeeds. Expansion/redirection errors remain failures.
Command substitution has independent shell control state: its `exit` cannot
terminate the outer interpreter, its cwd and environment changes are restored,
and an outer `set -e` does not stop a finite substitution such as
`$(false; echo value)` before its final command. Files written by the
substitution remain in the shared WasmFS, as they do for every Dolly command.
Slop does not yet implement Bash's fragment-level splitting or the mixed-word
forms of quoted `"$@"` such as `"prefix$@"`; those remain explicit gaps. `!` is parsed
as pipeline or parenthesized-group status inversion only at a command boundary;
inside `/bin/[ ! -d path ]` it remains an argument to the separately compiled
test command.

## Pipelines

Lists run serially: Slop spawns each external command, which gets a fresh
private Wasm instance (see [the process model](process-model.md)), and waits
for its status. A pipeline starts all of its stages before it waits. Every
stage is a subshell, so `exit`, `cd` and assignments in a stage never reach the
shell. A stage whose command name is a literal external command runs as its
own process and streams into a kernel pipe, so `make 2>&1 | tee log` shows
progress and `find / | head` stops reading early. A stage that runs inside
Slop (a builtin, function, compound command, or computed command name) writes
its complete output to an unlinked WasmFS spool file before the next stage
starts, so the single-threaded shell never waits on a reader that has not
started. Command substitution and here-documents use the same spool.

Dolly's process libc does not yet raise `SIGPIPE` when a write finds no
reader. After a consumer such as `head` exits, the producer receives `EPIPE`
instead of terminating: `seq 1 2000000 | head -n 1` prints `1` at once, but
`seq` still runs to completion and reports `Broken pipe`.
`-jN` is accepted by Dolly's GNU Make port but clamped to one effective job.

Plain `Ctrl+C` targets the currently running foreground process tree through
Dolly's kernel `SIGINT` path and returns status 130, leaving Slop and the
shared in-memory filesystem alive. Cooperative polling gets a 500 ms grace
period; a process that ignores it has its private Worker forcibly terminated.

Pi's shell tool and `!` use pipe-backed child handles, stream stdout/stderr,
and close stdin with EOF; neither provides an interactive child terminal.
There is no fixed 60-second tool deadline. Callers may supply a timeout, and
timed spawns have a trusted supervisor timer that returns status 124 even for
uninstrumented CPU loops. The kernel filesystem and parent survive.

SIGINT stops the remaining list, pipeline and command-substitution work.
An ordinary `exit 130` is a command failure and does not interrupt later commands.
See the [process cancellation contract](process-model.md#cancellation).

## GNU Make

GNU Make 4.4.1 is fetched from its checksum-pinned official release, prepared
as an auditable source manifest, fetched by a Dollyfile `SOURCE` row, extracted
by the source-built `/bin/tar`, and compiled into `/usr/bin/make` inside the
browser. The C Dollyfile engine prints each `SLOP` row and stops at the first
failure. Each module supplies its own small Makefile for non-seed tools. The port uses Make's
remote-job adapter as a narrow synchronous execution seam:

- Make's default `SHELL` is `/bin/slop`;
- every recipe, including Make's shell-free fast path, passes through Slop;
- `$(shell command)` runs through Slop and captures an unlinked WasmFS file;
- job completion is reported immediately through Make's existing job logic;
- no `fork`, host process, worker pool, browser shell, or raw socket is used.

The browser acceptance test exercises `SHELL`, `$(shell pwd)`, dependency
ordering, separate C compilation, linking, execution, `-j8` serial clamping,
and an up-to-date rebuild using a real Makefile. Slop regressions also check
sourced argument ownership, `$(shell ...)`/`.SHELLSTATUS`, and recipe failure
under `set -e`:

```sh
node --test test/slop.test.mjs
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=slop ./scripts/test-browser.sh
```

The native test needs Bash and a host `cc` with ASan/UBSan; its small spawn
shim runs host commands with the inherited descriptors and the exact
environment Slop passes. Browser tests execute real Wasm commands. For a shell-only edit,
`DOLLY_BROWSER_MODE=slop-source` compiles
the current source inside a disposable browser session before running the same
cases, without rebuilding all images.

## Browser boundary

Slop, Make, commands, descriptors, cwd, environment, terminal parsing, glyph
rasterization, and mutable files are all inside the Wasm runtime. The browser
forwards bounded input records, blits a checked RGBA frame to Canvas, and owns
the separately documented HTTP broker; it does not parse commands or provide a
filesystem or process implementation. Slop is an ordinary private process; its
terminal reads cross `dolly_process_0.call` into the kernel's in-Wasm terminal
device.

The acceptance proof injects real Ghostty terminal input and verifies the same
path used by a person. Emscripten's `window.prompt` stdin fallback is absent.
