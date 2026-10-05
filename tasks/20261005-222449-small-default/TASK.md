# Merge minimal into default: a small default that explains amy

- STATUS: OPEN
- PRIORITY: 305
- TAGS: images,packages,amy,core

Owner request (2026-10-06): "merge the default and minimal image, make
default smaller and show some startup text describing how to use amy."

## Today (main `230fd887`)

- `default` is `FROM system` plus a start-up script: 160.4 MB, of which about
  135 MiB is the C/C++ toolchain; it also holds Git, the sbase tools, awk,
  curl, Make, `download`/`upload` and `session-recover`. Its `.dollyrc` prints
  one line, `DOLLY / DEFAULT`.
- `minimal` is `INSTALL core` (Slop and 18 core commands, 1.0 MB) plus
  `INSTALL display` (9.5 MB): 10.4 MB, with no network, compiler or amy.
- Packages that already exist: `core`, `cc` (compiler, headers, libraries and
  Make; installs in about 2 s), `amy`, `curl`, `display`, `zlib`, `gzip`,
  `python`, `javascript`, `ripgrep`, `fd`, `nvim`, `emacs`, `rust`, `cmake`,
  `sdl2` and the models. Git, the sbase tools, awk, `download`/`upload` and
  the session tools are not packages: they exist only inside `system-tools`.
- Only `zero-ad` builds `FROM` `default`; 25 test files name the `default`
  image, most because it has the compiler.

## Work

- One image, `default`: `core`, `display`, `amy` and what a first session
  needs to fetch and save (decide by measuring: `curl`, `download`/`upload`,
  sessions), composed with `INSTALL`. `minimal` goes away. Record the size.
- Everything today's `default` offers stays one install away: package what
  is not yet a package (Git, the POSIX tools beyond `core`, awk, the session
  tools) so `amy install cc git …` rebuilds the old environment, and say in
  the task which names do.
- Start-up text, short and from one tracked file: what this is, `amy list`,
  `amy install cc` (and one or two more examples), and where help lives
  (`help`, `man`). It follows the friendlier amy
  (`20261005-220754-amy-descriptions`) and the help work
  (`20261005-220754-man-help`); do not hand-copy what those print.
- Move what relied on the big `default`: `zero-ad`'s base, and the tests that
  compile C (install `cc` in the test, or open a toolchain image). The
  GitHub Pages catalog and the start page follow the registry.

## Done when

- `default` opens with the text, is a small fraction of today's size
  (measured), and `amy install cc` then compiles and runs a C program in
  Chrome and Firefox; `amy install` restores each tool the old image had.
- No image or test depends on the old contents; the catalog rebuilds and the
  source, artifact, browser and demo suites pass.
