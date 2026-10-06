# What an autoconf configure needs from Slop and Dolly: measured with four real ones

- STATUS: OPEN
- PRIORITY: 230
- TAGS: slop,compatibility,corpus

The Pi skill says "upstream ./configure scripts usually need more shell than
Slop has". Measured 2026-10-06 on `core/concurrent-pipelines`: the native Slop
(`src/slop.c` with `test/fixtures/native-spawn.c`, host tools) ran four
upstream `configure` scripts, each also under Bash 5 in a second build
directory, and the output and every generated file were compared.

| Package | `configure` | Checks printed | Result under Slop |
| --- | --- | --- | --- |
| GNU Make 4.4.1 (autoconf 2.71, automake) | 16,987 lines | 211 | same output, same files |
| libffi 3.5.2 (autoconf 2.72, libtool) | 24,407 lines | 144 | same output, same files (`--build` given) |
| CPython `823f0323` (plus `Modules/makesetup`) | 975 KB | 798 | same output, same `Makefile`, `pyconfig.h`, `Modules/config.c` |
| GNU bison 3.8.2 (gnulib) | 1.48 MB | 545 | same output, all 329 generated files equal |

"Same" is after replacing the build directory and the shell's path, and with
`CONFIG_SHELL` set to Slop and `_as_can_reexec=no` so that `config.status`,
`config.sub` and `libtool` run under Slop too. It needs the seven fixes below
and `umask`, which is not committed (see 8).

## What they needed, in the order they failed

1. `"$as_dir$ac_word${1+' '}$@"`: a quoted `$@` inside a word was refused
   when the script was read, so no `configure` parsed at all. Fixed
   (`2de376bd`): one field per parameter, joined by a space where fields do
   not split.
2. `${1+"$@"}`, the pre-POSIX spelling of `"$@"`, in every M4sh preamble.
   Fixed in the same commit, as that exact word. Any other `"$@"` nested in a
   `${...}` word still joins and resplits (not POSIX); no script here has one.
3. `$LINENO`. Without it autoconf looks for a better shell and `exec`s it, or
   rewrites itself with `sed` and `chmod +x`. Fixed (`8ba77e3a`).
4. `trap ... 1 2 13 15`: `PIPE` could not be trapped. Fixed (`ffef482a`).
5. `( sleep 1 ) & am_sleep_pid=$!` (automake). Fixed in the same commit: a
   subshell of one simple command is that program; other compound commands
   after `&` stay refused.
6. `cat >"$tmp/defines.awk" <<\_ACAWK ||` with the failure branch after the
   here-document's body (every `config.status`): the newline was a separator,
   so the failure branch always ran. Fixed (`83d1ac2b`).
7. `for i in ${*-Setup}` (CPython's `makesetup`). Fixed (`84e48173`).
8. `umask`: `(umask 077 && mktemp -d "./confXXXXXX")`, then
   `(umask 077 && mkdir "$tmp")`, in every `config.status` and `config.guess`;
   both fail and the script stops. OPEN: `20261006-120641-umask` (file modes).
   The runs above used an uncommitted Slop that accepts `umask`.

## Not shell syntax, and still in the way inside Dolly

- `chmod`: `test $as_write_fail = 0 && chmod +x $CONFIG_STATUS || ac_write_fail=1`
  ends every `configure` with "write failure creating config.status" where
  there is no `chmod` command (5 to 20 uses per script). Same task as 8.
- `test -x`: `as_fn_executable_p` is `test -f "$1" && test -x "$1"`, called
  224 times by Make's `configure` to find `cc`, `grep`, `install` and the
  rest on `PATH`. Whatever file modes become, every program in an image must
  answer it.
- Identity: `config.guess` cannot name Dolly (`uname` is `Dolly wasm64`) and
  `config.sub` rejects an operating system it does not know, so a package
  with `AC_CANONICAL_HOST` (libffi, bison, CPython) stops at "cannot guess
  build type" or at `--build=wasm64-unknown-dolly`. `AGENTS.md` forbids
  claiming Linux. This is the first failure that is not Slop's or the
  kernel's, and no shell work removes it.
- `exec`: with `CONFIG_SHELL` set, or when a shell that passes more of
  autoconf's tests is found, `configure` runs `exec $CONFIG_SHELL "$0" "$@"`,
  which Slop refuses by decision (`docs/slop.md`). Inside Dolly no other shell
  exists, so the search finds none and the script continues in Slop; the
  refusal was hit natively only because `/bin/bash` exists here.
- libtool's shell test runs `PATH=/empty; test "X\`printf %s $ECHO\`" = "X$ECHO"`
  and so only passes where `test` and `printf` are builtins. It is in the
  "suggested" set: failing it only starts the search for another shell.
- Cost: Make's `configure` runs 14,932 traced commands, of which `test` 1,898
  and `printf` 1,561 are programs in Dolly and builtins in every other shell;
  with `rm` 415, `cat` 348, `grep` 188, `mv` 142 and `sed` 124 that is about
  4,700 Workers before the compiler runs once. Measured natively
  (`slop -x`); the time inside Dolly is not measured. Builtin `test`, `[`,
  `printf` and `echo` would remove about three quarters of them.

## POSIX probes (60 one-liners in dash, Bash and Slop; 2026-10-06 night)

Slop differed from both shells in twelve. Fixed, each with cases against Bash:

- `$'...'` with its C escapes (POSIX.1-2024) (`2807b144`).
- `$((x=7))`, `$((x+=2))` and the other assignments, and `?:` (`3902de9e`).
- Field splitting: literal text was split (`IFS=:; set -- a:b$x` gave two
  words) and `a::b` lost its empty field (`1e1af65c`).
- A tilde after each colon of an assignment: `PATH=$PATH:~/bin` (`464cc3a7`).
- `f() ( ... )` and any other compound command as a function body (`71d0d6b7`).
- `${x:+"$x"}`: the quoted part split and globbed (`bef602ba`).

Open, found by the probes:

- `"${x%"$suffix"}"`: a quoted pattern is still read as a pattern (libtool's
  `func_stripname` writes it three times). Wrong only when the value holds
  `*`, `?` or `[`.
- `readonly`, `hash` and `times` are not builtins ("command not found").
  None of the scripts measured here uses them (0 uses in four `configure`
  scripts, `ltmain.sh`, `config.guess`, `install-sh` and CMake's `bootstrap`),
  so by `docs/slop.md` they wait for a need.
- `exec PROGRAM` is in those scripts 18 times: libtool's wrapper for an
  uninstalled program ends in `exec "$progdir/$program" ${1+"$@"}`, so a
  libtool package cannot run its own test programs under Slop. Spawning the
  program, waiting and exiting with its status would serve every one of the
  18; it is refused by the boundary in `docs/slop.md` and needs the owner.
- The same scripts call `printf` 9,963 times and `eval` 1,165 times.

## Evidence

`build/pipelines-evidence/` (not committed): `run-configure.sh NAME` runs
`configure/NAME/configure` under both shells and compares; the sources are
copies of the shared cache.
