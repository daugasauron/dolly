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
slop [-enx] -c 'command' [name [arg ...]]
slop [-enx] script [arg ...]
```

The no-argument form is interactive. GNU Make uses `/bin/slop -c`. Script mode
reads a file from WasmFS. All modes use the same parser and executor.
`-n` parses without executing and is useful for checking imported build
scripts; `-e` enables checked execution and `-x` prints executed commands.

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
  Slop's deterministic wildcard matcher and first-match execution;
- named `NAME () { COMMANDS; }` functions with function-local positional
  parameters, scoped `local NAME[=VALUE] ...` variables, `return [STATUS]`, a
  recursion limit of 64 calls, and ordinary current-interpreter
  `{ COMMANDS; }` groups whose trailing redirections wrap the complete group;
- parenthesized `(COMMANDS)` groups with private cwd, environment, functions,
  positional/option state, and `exit`; their file mutations remain in the
  shared WasmFS, their finite standard-stream redirections wrap the complete
  group, they can form the first stage of a serial pipeline, and no process is
  created;
- serial pipelines of any length with `|`; the optional `set -o pipefail`
  returns the rightmost nonzero stage status without introducing concurrency;
- single and double quotes, backslash escapes, and boundary comments with `#`;
- backslash-newline continuation in scripts and `-c` command text;
- ordered `<`, `>`, and `>>` file redirections for descriptors 0 through 9,
  descriptor duplication and closing with forms such as `2>&1`, `6>&1`,
  `7<&0`, and `5>&-`, execution-time descriptor words such as `>&$fd` that
  must resolve to exactly one digit or `-`, and persistent descriptor setup
  through redirection-only `exec`;
- up to 32 `<<DELIMITER` here-documents on one command line; literal quoted
  delimiters suppress expansion, while unquoted bodies expand parameters,
  arithmetic, command substitutions, and simple legacy backticks at execution
  time; tab-stripping `<<-` is deliberately not part of this finite form;
- `$VAR`, `${VAR}`, `$?`, `$$`, `$#`, `$-`, `$0` through `$9`, `$@`, and
  `$*`; exact quoted `"$@"` words preserve every positional argument and empty
  field, while `$-` reports Slop's active `e`, `i`, `n`, and `x` flags;
- the finite `${VAR-word}`, `${VAR=word}`, `${VAR+word}`, and `${VAR?message}`
  default/assignment/alternate/error forms, plus their colon variants
  `${VAR:-word}`, `${VAR:=word}`, `${VAR:+word}`, and `${VAR:?message}`;
  the colon variants also select empty values, and selected words support
  nested dollar expansion;
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
- deterministic `*`, `?`, and bracket globbing in one path component;
- execution-time `~` expansion at the start of a fully unquoted word or the
  value of an assignment, using the current `HOME`; named-user forms are not
  part of Dolly's no-user-model shell;
- persistent assignments, command-prefix assignments, `export`, and `unset`;
- sorted shell-state output from bare `set`, positional replacement with
  `set [--] ARG ...`, and checked `shift [N]`;
- line input with `read [-r] [NAME ...]`; it assigns shell state, honors `IFS`
  for deterministic basic field splitting, and works with ordinary `<`
  redirection;
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
  arguments temporarily become the sourced script's positional parameters;
- `eval [WORD ...]`, which joins its already-expanded arguments with spaces and
  parses the result in the current interpreter;
- `set -e`/`set +e`, command tracing with `set -x`/`set +x`, and named
  `set -o`/`set +o` options for `pipefail`, `errexit`, `xtrace`, and the
  compatibility-only `posix` probe; option letters may be combined, as in
  `set -ex`;
- state-aware `type [-p|-P] NAME ...`, which can distinguish Slop functions,
  builtins, filesystem executables, and missing commands.

Only state that must affect the current interpreter is built in: `:`, `.`, `source`,
`eval`, redirection-only `exec`, `return`, `exit`, `cd`, `export`, `unset`, `set`, `shift`, `read`,
`getopts`, `local`, `type`,
`break`, and `continue`. Utilities such as `echo`, `pwd`, `cat`,
`grep`, `awk`, `cc`, and `make` are executable files found through `PATH`.
`/bin/cd` still exists as a standalone compatibility command, but an unqualified
`cd` is necessarily the stateful builtin.
The builtin `cd [--] [DIRECTORY]` updates `PWD` and `OLDPWD`; `cd -` returns to
and prints the previous directory. These variables are restored with the cwd
across a parenthesized group or command substitution.

The small compatibility set is still made of ordinary programs. Dolly-owned
`which` and `command -v` search `PATH`, while `command`, `xargs`, and
`find -exec` perform bounded serial execution through the same in-Wasm
spawn/wait lifecycle as Slop. `du` measures logical in-memory content rather
than nonexistent disk blocks, and `tty` reports Dolly's terminal without
asking the browser.
`install` supports the ordinary file/directory forms used by Make recipes;
mode, owner, and group options are accepted as syntax but create no metadata.
`dd` copies bounded blocks within the shared filesystem or serial pipelines;
its finite operand set includes `bs`, `count`, `skip`, `seek`, `notrunc`, and
`sync`, while unsupported conversions fail explicitly.
`xargs` accepts `-P 1` but rejects parallel execution explicitly. Dolly-owned
`find` walks sorted directory entries without following symlinks and supports
the common name/path/type/empty, depth, prune, print, and serial-exec subset;
user/group/permission predicates fail because Dolly has no such model.
Dolly-owned `tail` implements finite line/byte selection and explicitly rejects
follow mode, while `tee` duplicates bytes and appends but cannot suppress the
runtime's unconditional foreground Ctrl+C. Dolly-owned `env` builds a complete
child environment and uses typed `dolly_spawn_env`; assignments and unsets do
not leak into Slop. `printenv` indexes the shared environment without advancing
libc's global `environ` pointer. Dolly-owned `timeout` runs a nested command
through the runtime's synchronous deadline operation; checkpointed code exits
with status 124, and nested calls inherit the earliest deadline. `time` reports
monotonic elapsed time, while `uname` and `hostname` return the deterministic
Dolly/wasm64 target identity rather than inspecting the browser. Source-built sbase supplies
`cut`, `od`, `printf`, `sort`, `uniq`, `basename`, `dirname`, `tr`, `cmp`,
`comm`, `paste`, `join`, `seq`, `expr`, `nl`, `split`, `strings`, `cksum`,
`fold`, `expand`, `unexpand`, `tsort`, `pathchk`, `date`, `mktemp`, `sha256sum`, `md5sum`,
`sleep`, `true`, `false`, `ln`, `readlink`, and `rmdir` in addition to the text
tools above. Symbolic links work, but
WasmFS's current `linkat` implementation rejects hard links, so plain `ln`
fails while `ln -s` is supported.
Since there are no execute
permission bits, `test -x FILE` means “FILE is a regular executable candidate”;
actual Wasm format, contract stamp, and ABI validation happen when the loader
runs it. For the same reason, `test -r PATH` and `test -w PATH` mean that the
path exists in mutable WasmFS; they never inspect mode or identity metadata.
`test` and `[` also implement the conventional `!`, `-a`, `-o`, and
parenthesized finite boolean expressions used by portable build scripts.
Standard `printf` rules still apply: `%s` does not interpret backslash
escapes in an argument, so agents should use the Pi write tool for multiline
source and Makefiles rather than assembling them with fragile shell quoting.
The separately compiled `diff` and `patch` commands reuse source-built Git's
non-repository comparison and apply engines with paging disabled; `patch`
supports the finite noninteractive unified-patch subset shown by `patch --help`.

The current subset does not implement aliases, background jobs, job control,
parameter substring slicing, or search-and-replacement. Except for a
parenthesized group in the first position, compound commands are not pipeline
stages yet; use a temporary file or wrap the required operation in an ordinary
command when importing a script that pipes into or out of `case`, `if`, or a
loop.
Those are added only when a useful source build demonstrates a need and the
semantics can remain explicit.
Slop is therefore not advertised as POSIX `sh` or Bash.

Dollar expressions are length-framed during tokenization and expanded only
when their simple command is reached. Thus `x=value && test "$x" = value` and
`echo value > file && test "$(cat file)" = value` observe the earlier command,
while escaped or single-quoted dollars remain literal. `$?` uses the same
execution-time rule, so `false; test $? -eq 1` observes the preceding status.
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
the terminal. These checks are cooperative. If the same foreground PID does
not acknowledge Ctrl+C within two seconds, the trusted page terminates and
reloads the complete runtime worker; a second Ctrl+C requests that hard stop
immediately. A named session returns to its last explicit checkpoint, while an
unnamed session returns to the sealed base image. The browser cannot serialize
a WasmFS that is already monopolized by foreign code, so changes after the
last checkpoint are intentionally not claimed to survive hard replacement.

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
