# Add man and make every shell command explain itself

- STATUS: OPEN
- PRIORITY: 235
- TAGS: core,commands,docs,agent-experience


Owner request (2026-10-06): "I want to add the man command, and make sure
things in general in the shell has good man/help."

## Today (main `4f8a2309`)

- There is no `man`. `help` (a core command in `Dollyfile-system-build`)
  prints one page about Slop: builtins, expansions, options.
- `--help` is uneven: the in-house commands answer it (35 `"--help"` branches
  across the core recipes, `src/commands/` and `src/slop.c`); sbase commands
  print a usage line only on a wrong invocation; sbase ships a `.1` page per
  command that the image does not retain; Git, Make, curl and awk carry their
  own help of very different depth.
- Packages bring commands with no shared help convention (`rg --help` is long,
  `amy` prints four lines).

## Expected

- `man NAME` works for every command on `PATH` in `default`, from retained
  pages: upstream pages where they exist (sbase's `.1` files unchanged), short
  in-house pages for Dolly's own commands (`amy`, `download`, `upload`,
  `foreground`, `dollyfile`, `session-recover`, Slop itself). Decide the
  renderer by measuring: a small `man` over plain pages, or an upstream
  formatter if one builds unchanged and is small.
- One convention for in-house commands: `NAME --help` exits 0 and prints
  usage, one line per option and an example; a wrong invocation prints the
  usage line to stderr and exits 2. `help` points at `man` and lists the
  commands with their one-line summaries.
- A package's pages arrive with it: `INSTALL` and `amy install` bring
  `/usr/share/man` entries like any other file
  (`20261005-220754-amy-descriptions`).
- One story with `20261005-133403-self-description`, which ships the
  platform documents under `/usr/share/doc/dolly/` and makes `help` point
  there: `man` covers commands, that directory covers the platform, and
  neither repeats the other. Git already looks in `/usr/share/man`
  (`GIT_MAN_PATH` in `Dollyfile-system-tools`) and finds nothing.

## Done when

- A browser test walks every command on `PATH` in `default` and checks that
  `man NAME` and (for in-house commands) `NAME --help` succeed with non-empty
  output; the same check runs after `amy install` of one package.
- Image growth from retained pages is measured and recorded.

This changes the seed (`system-build`, `system-tools`): batch it with the next
rebuild round.
