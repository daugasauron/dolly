# A while or until loop left by break or continue reports the previous body's status

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: slop,bug

Found while testing concurrent pipelines (`20260930-100000-audit-32`):
`i=0; while :; do i=$((i+1)); test $i = 3 && break; done; echo $?` printed 1
in Slop and 0 in Bash and dash.

## Rule

POSIX (XCU 2.9.4.3 and 2.9.4.4, and the `break` and `continue` special
builtins): `break` and `continue` exit 0; the status of `while`/`until` is
that of the last body (compound-list-2) executed, or 0 if none; the status of
`for` is that of the last command executed, or 0 without items. So a body
ended by `break` or `continue` has status 0, and that is the loop's status.
Bash 5 and dash agree on every case below except one.

## Measured (37 one-liners in Bash, dash and native Slop; 2026-10-06)

- Wrong, fixed here: `parse_while` took a body's status only when the body
  ran to its end, so a loop left by `break`, or whose last body ended in
  `continue`, reported the status of the body before it. `while`, `until`,
  `break 2` from an inner `while`, and `break N` past the outermost loop were
  affected; `for` was already right.
- Bash and dash differ: a `break` in the *condition* after a failing body
  (`while i=$((i+1)); test $i = 2 && break; :; do false; done`) is 0 in Bash
  and 1 in dash. Slop keeps 1: no body ran, so the last body's status stands.
- Unspecified, left alone: `break` outside a loop is status 1 with a message
  in Slop, 0 in Bash (with a message) and dash.
- `set -e` (fixed in a second commit). POSIX 2.14 `set -e`: `-e` is ignored
  in the condition of `while`/`until`/`if`/`elif`, in a `!` pipeline and in
  every command of an AND-OR list but the last, also inside the compound
  commands and functions such a command runs; and (third exception) a
  compound command other than a subshell whose status comes from a failure
  that was ignored does not end the shell. Slop ended it: each of these
  printed its status in Bash and dash and exited 1 silently in Slop, before
  this branch too:

      set -e; for i in 1 2 3; do test $i = 2 && break; done; echo $?
      set -e; i=0; while :; do i=$((i+1)); test $i = 2 && break; done; echo $?
      set -e; for i in 1; do test $i = 2 && break; done; echo $?
      set -e; i=0; while test $i -lt 1; do i=$((i+1)); false && :; done; echo $?
      set -e; for i in 1 2; do test $i = 2 && continue; done; echo $?
      set -e; for i in 1 2; do if false; then :; fi; test $i = 9 && break; done; echo $?
      set -e; f() { for i in 1 2; do test $i = 2 && break; done; }; f; echo $?

  Cause: `-e` travelled as a non-zero status. A failing command only stopped
  its list; `parse_for` and `parse_while` left the loop on any non-zero body
  status, and every list above stopped on the status of the compound command
  it had run, although the failure was the left side of `&&`.

  Fix (`execute_pipeline`, the one place that knows the separator): a failing
  pipeline that is not ignored ends the shell there (`active = 0`, as `exit`
  does), so no status has to carry it upwards and the loops' and the list's
  own checks are gone. `errexit_ignored` already tracked the ignored
  contexts, functions included, and is unchanged. New: `errexit_exempt`
  records that the last pipeline ran while `-e` was ignored; a compound
  command other than a subshell (`{ }`, `if`, `for`, `while`, `until`,
  `case`) ends the shell on its own status only when that is not so, which is
  a failed redirection of the compound command itself. At the prompt the
  line is meant to stop and the shell to stay, as before (`errexit_fired`
  revives it like Ctrl+C does). UNVERIFIED: the prompt does not run natively;
  check `set -e; false; echo no` at an interactive prompt in a browser.

  Measured with 60 one-liners (`build/pipelines-evidence/e-matrix.txt`, not
  committed): the new Slop matches Bash 5 in all 60, stdout and status; 17
  changed from the old Slop, all of them compound commands ending in an
  ignored failure (loops, groups, `if`, `case`, nested `break 2`, a function
  called left of `&&` in a loop). Unchanged and equal to Bash: a function or
  subshell that returns non-zero ends the shell; a loop in an `if` condition
  is ignored; a failure inside a loop body ends the shell and runs the EXIT
  trap. Bash and dash differ in five, Slop is with Bash: `$(...)` does not
  inherit `-e` (dash does), and a failed redirection of a compound command
  ends the shell (dash continues with 2).

## Done when

- The loop-status and `set -e` cases in `test/fixtures/slop-cases.mjs` pass
  natively under ASan/UBSan against Bash: done, 168 of 168
  (`node --test test/slop.test.mjs`).
- `test/slop-browser.mjs` runs the same cases in Dolly: not run (no browser
  tonight). Close after it passes.

## Catalog scripts through the native shells (2026-10-06)

Parse only (`slop -n -c BODY`), since the bodies need Dolly's filesystem and
tools to run: 425 `SLOP` bodies, one tracked `.slop` file and 17 scripts
embedded in `FILE` blocks, with the Slop of `cb97888c` and of this branch.
Every one parses with both; status and messages are identical; none contains
a lone `&`. Behaviour was not compared.

`set -e` and the catalog: no script's behaviour changes. The 425 `SLOP`
bodies (`slop -e -c`) contain no loop and no other compound command. Of the
embedded scripts, four have loops: `/tmp/neovim-parsers/build.slop`
(`Dollyfile-neovim-build:222`), `/tmp/zad/build.slop`
(`Dollyfile-zero-ad-deps:72`) and `/tmp/premake.slop`
(`Dollyfile-zero-ad-engine:32`) run with `set -ex` and their loop bodies are
plain commands without `&&`, `||` or conditionals; Pi's `/etc/dolly/init.slop`
(`Dollyfile-pi:18`) has `case ... break` and `if` in its loop but runs without
`-e`. A flat list behaves as before, so nothing that stops today continues.

## Closed 2026-10-07

The two fixes went into the candidate with `core/concurrent-pipelines`
(`5ccedb2e`, merged into `integrate/next` "the second time for `set -e` and
loop status"). `test/slop-browser.mjs` runs `shellCases` of
`test/fixtures/slop-cases.mjs`, which holds the loop-status cases ("a while
loop left by break has break's status", "break 2 from a while inside a for",
…) and the `set -e` cases ("set -e ignores the left of && in a while body",
…); the `slop` suite passed in Chromium and Firefox in the main round
(`work/next/build/next-evidence/browser-final/summary.txt`, `round-3.log`).
