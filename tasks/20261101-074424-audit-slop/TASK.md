# Audit: Slop, the seed commands and the Dollyfile language

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,audit,slop,dollyfile

The 2026-11-01 night audit of the minimal userspace and the image language (agent C, branch
`core/audit-slop` from `main` `577aafb1`): `src/slop.c` and `docs/slop.md`, `src/commands/`,
the Dollyfile language (`docs/dollyfile.md`) and its two implementations (`src/dollyfile.c`,
`src/dollyfile-view.mjs` with `src/dollyfile-graph.mjs`), the linters and pin scripts.
Measure: Unix philosophy, POSIX where claimed, explicit failure otherwise.

## State (2026-11-01 17:10)

Slop fixes are on the branch, verified natively against Bash and dash; the browser
verification waits for the seed batch below to be rebuilt.

## Method

Native Slop (`src/slop.c` with `test/fixtures/native-spawn.c`, ASan and UBSan) against dash
(POSIX) and Bash on probe batteries (`build/audit-slop-evidence/probe/`), then the cases that
differ were read in the source.

## Findings fixed

1. **A command substitution ended at the first unbalanced `)`**: `$(...)` was found by
   counting parentheses with quotes, so a here-document, a comment or a case pattern inside it
   ended it early. The agents' commit-message form fails on any apostrophe or parenthesis in
   the message (`git commit -m "$(cat <<'EOF' … didn't … EOF )"`: "unterminated command
   substitution"), as do `$(case $x in a) …;; esac)` and a comment with `)` or `'`. The same
   counter was written twice (`defer_dollar`, `expand_dollar_now`). Now one scanner,
   `substitution_end`, reads the text as the shell reads a command: quotes, escapes, comments,
   nested substitutions, here-document bodies and case patterns; `arithmetic_end` serves both
   `$((`. Case "a substitution holds a here-document, a comment and a case pattern" fails on
   main (status 2) and passes.
2. **`"$@"` inside a parameter word was one field, except for one spelling**: the lexer matched
   the exact text `${1+"$@"}` (`deferred_guarded_positional_fields`); `${1:+"$@"}`,
   `${x-"$@"}` and `"${1+$@}"` joined the parameters into one field, silently. The rule is now
   general: a quoted `$@` in a parameter word gives one field per parameter, empty ones kept,
   with the same `'f'` boundaries a quoted `$@` inside a word already used; the special case is
   gone. The corpus (`.cache` sources) spells it only `${1+"$@"}` (344 times), which still
   passes; case "a quoted $@ in a parameter word is one field per parameter" fails on main
   (status 91) and passes.
3. **Tab completion ignored `~`** (task `20261030-212535`): `collect_completions` opened the
   directory `~/.pi` literally. Reproduced in Chromium on main's `pi-minimal`: Pi's editor
   completes `ls ~/.pi/a` to `~/.pi/agent/`; Slop completes `ls /home/dolly/.pi/a` but not
   `ls ~/.pi/a` or `ls ~/.p`. The dot directory is not the cause (hidden entries are offered
   once the typed name starts with `.`, as in Bash). A leading `~/` now completes under `HOME`
   and keeps `~/` on the line.

## Lessons

- A plain `npm run image` stages `src/` while it runs: editing `src/slop.c` during its source
  preparation pinned a half-edited Slop into every recipe and started a 183-image rebuild,
  stopped after six images. Never edit seed inputs while a build in the same tree prepares.
