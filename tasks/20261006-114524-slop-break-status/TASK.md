# A while or until loop left by break or continue reports the previous body's status

- STATUS: OPEN
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
- OPEN, not fixed: `set -e`. POSIX 2.14 `set -e` rule 3 says a compound
  command whose status comes from a failure while `-e` was ignored does not
  end the shell. Slop ends it: every one of these prints its status in Bash
  and dash and exits 1 silently in Slop, on this branch and before it:

      set -e; for i in 1 2 3; do test $i = 2 && break; done; echo $?
      set -e; i=0; while :; do i=$((i+1)); test $i = 2 && break; done; echo $?
      set -e; for i in 1; do test $i = 2 && break; done; echo $?
      set -e; i=0; while test $i -lt 1; do i=$((i+1)); false && :; done; echo $?
      set -e; for i in 1 2; do test $i = 2 && continue; done; echo $?
      set -e; for i in 1 2; do if false; then :; fi; test $i = 9 && break; done; echo $?
      set -e; f() { for i in 1 2; do test $i = 2 && break; done; }; f; echo $?

  Cause: `-e` travels as a non-zero status, not as a fact. `parse_for` and
  `parse_while` leave the loop when `errexit && status != 0`, and the list
  above them ends the script on the loop's status, although the failing
  command was the left side of `&&`. It needs "errexit fired" recorded apart
  from the status. Recipes run `slop -e -c`, so a loop body that ends in
  `test ... && command` stops a recipe; the catalog builds today, so none
  does. `set -e; ... false; break` (exit 1) and `false || break` already match.

## Done when

- The loop-status cases in `test/fixtures/slop-cases.mjs` pass natively under
  ASan/UBSan against Bash: done, 155 of 155 (`node --test test/slop.test.mjs`).
- The seven `set -e` lines above print what Bash prints: open.

## Catalog scripts through the native shells (2026-10-06)

Parse only (`slop -n -c BODY`), since the bodies need Dolly's filesystem and
tools to run: 425 `SLOP` bodies, one tracked `.slop` file and 17 scripts
embedded in `FILE` blocks, with the Slop of `cb97888c` and of this branch.
Every one parses with both; status and messages are identical; none contains
a lone `&`. Behaviour was not compared.
