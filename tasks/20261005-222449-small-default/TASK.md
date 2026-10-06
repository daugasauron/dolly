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

## Measured (2026-10-06, `work/small-default`, image inputs `22d006ca…`)

What `default` holds today, by the package that owns each file
(`build/userspace2-evidence/default-breakdown.txt`; the snapshot is
160,617,901 bytes, 45.9 MB compressed, 2,203 paths):

| Part | Files | Bytes | Installable today |
| --- | ---: | ---: | --- |
| C/C++ toolchain and Make | 1,934 | 135,463,871 | `cc` |
| Git | 26 | 9,928,532 | no |
| Display plugin and font | 4 | 9,346,111 | `display` |
| sbase and Dolly's commands (60: `grep`, `sed`, `sort`, `find`, `xargs`, `sh`, …) | 60 | 3,042,995 | no |
| Slop and its 18 commands | 19 | 898,925 | `core` |
| curl and libcurl | 16 | 375,673 | `curl` |
| awk | 2 | 269,946 | no |
| zlib, gzip | 5 | 334,670 | `zlib`, `gzip` |
| amy and the recipe engine | 2 | 183,476 | `amy` |
| Ninja | 2 | 148,196 | no |
| `download`, `upload`, `session-recover` | 3 | 121,327 | no |
| Image record, start-up files, licences | 23 | 385,642 | |

The compiler is 84% of the image; everything else together is 25 MB.

## Design (2026-10-06)

- **One image for people.** `default` is a composition, as `minimal` was:
  `INSTALL core`, `display`, `curl`, `amy`, its start-up script and text.
  `minimal` goes: it was `default` without a way to grow. No compiler: `amy
  install cc` brings it (135.8 MB, 37.8 MB to download, about 2 to 5 s).
- **What is there at the first prompt**: a shell and its file commands, the
  terminal, `curl` to fetch, `amy` to install, and saving a session (the
  page's, Ctrl+Shift+S). A first-time visitor needs to see that it works and
  how to get more; an agent needs to read files, fetch and install.
- **What an agent also needs, and does not get yet**: the POSIX text tools
  (`grep`, `sed`, `sort`, `head`, `find`, `xargs`, `sh`; 3.0 MB) belong in
  `default`, and Git (9.9 MB), awk, Ninja, `download`/`upload` and
  `session-recover` one install away. None is a package: they are built
  inside `system-tools`. Until they are, the small `default` cannot `grep`,
  and those tools are reachable only by opening `system`. This is the part
  of "everything stays one install away" that is not done.
- **Host modules: unchanged** (`runtime`, `display`, `download`, `http`,
  `packages`, `snapshot`, `threads`, `upload`). A package is refused in an
  image that does not declare its modules, so the image people install into
  declares what today's packages need; its authority is what it was.
- **Start-up text**: in the recipe (`FILE /home/dolly/.dollyrc`, the one
  tracked copy), printed by the image's entry once per boot, not by each
  shell. It names `amy list` and two installs; a test checks every package
  it names against the index.
- **Suites say what they need.** A suite that compiles or uses the
  toolchain's tools names `system` (today's `default` without the start-up
  script and `packages@0`); only suites about the image people open stay on
  `default`.

## Cost (counted before changing anything)

- Images: only `zero-ad` is `FROM` `default`. A composition has no compiler,
  so `zero-ad` must name `system` (or become a composition itself,
  `20260930-231300-lean-game-images` stage 2).
- Release acceptance (`scripts/accept-release.mjs`) builds `FROM` every image
  that holds the engine and compiles a C program in it; the small `default`
  holds the engine (amy runs it) and no compiler.
- Suites that open `default` because it is the harness's default image, and
  what they use that leaves it:

| Suite | Compiler | Git | POSIX tools | `download`/`upload` |
| --- | :-: | :-: | :-: | :-: |
| `core` | | x | x | x |
| `shell`, `process`, `network` | x | x | x | `shell` |
| `cpp`, `slop`, `terminal`, `display`, `fs-growth`, `gpu-indicator`, `gpu-render` | x | | most | |
| `upload` | x | | x | x |
| `boundary`, `site` | | | x | `site` |
| `snapshot-stream`, `image-inventory` | | | | |

  By name: `amy` (stays, it is about `default`), `threads` (one block on
  `default`, compiles), `minimal` (the image goes), `demos/emacs` (one block
  installs into `default`).
- Smallest honest migration: `image: "system"` in each suite of the table
  that uses the compiler, Git or the POSIX tools, one suite at a time, each
  run in both browsers; `process` also tests `default`'s `init.slop`, so that
  block opens `default`. The harness default stays `default`.

