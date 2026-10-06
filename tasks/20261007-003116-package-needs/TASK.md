# Packages that start programs they do not install

- STATUS: OPEN
- PRIORITY: 285
- TAGS: packages,amy,images,agent-experience

Found 2026-10-07 in the night round: with `default` composed from packages
(`20261005-222449-small-default`), `amy install rust` gave a `rustc` that
could not link ("dolly-rust-link: spawn cc: No such file or directory"), and
`amy install cargo` a Cargo that could not build. The `rust` package had
always run `/bin/cc`; until tonight every image carried it. Fixed for `rust`
(`69e09fe3`: the package installs `cc`). The amy suite passed with the hole
open, because its Rust case ran where `cc` was already present.

The same gap is likely elsewhere: a package was correct as long as its base
happened to hold what it starts.

## Work

- For every package in the catalog (`PACKAGE` recipes), list the programs its
  commands start (`cc`, `make`, `ld`, `sh`, `git`, `curl`, `tar`, a pager, an
  interpreter) and whether the package or its `INSTALL` lines provide them.
  Measure by installing each alone on `default` and running its ordinary use,
  not by reading: `cmake` configuring and building a C project, `python`
  with `pip install` of a pure and of a C wheel, `emacs`, `nvim` with `:!`,
  `git` with an editor and a pager, `cargo`, `ripgrep`, `fd`, the model
  packages with `pi`.
- Decide per gap: the package installs what it needs, or its command says
  what to install (`amy install cc`) when the program is missing. A failed
  spawn should name the package that provides the program; today it names
  only the missing file.
- A test per package on `default` with nothing else installed; the amy suite
  is the place.

## Done when

Every package's ordinary use works after `amy install NAME` on `default`, or
fails with a message naming what to install, and a test holds each.
