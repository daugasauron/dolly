# What waits for the owner and the next catalog round

- STATUS: OPEN
- PRIORITY: 150
- TAGS: catalog,owner,packages,host-modules

State (2026-10-13): the round of 2026-10-13 took four of the seven items this
task was filed with: `pty@0` as a contract with tmux, `default` installing
`transfer`, dependencies by reference, and `python` installing `cc` and
`ninja`; `nena@0` answers a fifth, since `default` now enables a module
instead of declaring it. After it, with no round: `zero-ad` became an image
of its own packages (audit 19), and `gpu-sdk` and `audio-sdk`, which held
nothing, were deleted (audit 18). Nothing below is started. Each item is the
owner's to take or leave.

Done when: each item is in a round that passed, or is dropped here with the
reason.

## The audit's ranking

[The audit of 2026-10-13](../20261012-230015-audit-fable/TASK.md) ranks
thirty items and eight of the boundary, each with evidence and cost. Those
that change the seed or every recipe, and so want one round together:

- 1: the release version leaves every reference (a version change alone is a
  full rebuild today).
- 2, 4: the host modules' SDKs leave the root image, and `display` leaves
  `system-tools`.
- 3: the ABI digest hashes the generated layout, not the bytes of `process.h`.
- 5: recipe digests are no longer written into `FROM`, `INSTALL`, `COPY`.
- 8 to 11: `REQUIRES TOOL` goes, `EXPORTS FILE|FOLDER` lose their names,
  `SLOP` takes a body, licences and manual pages are kept by convention.
- 13, 14, 16: `runtime.h` to three functions, fifty operations to thirty-six,
  a block of operation numbers per module.
- 22: `system-tools` and `system` become one base, and the builds move into
  the packages that are views of them.

## Left by the round of 2026-10-13

- `python` stops installing `ninja`, by the owner's word
  ([task](../20261013-132701-python-ninja/TASK.md)): its recipe repins the
  chains that build with Python.
- The terminal does not turn Enter's carriage return into the newline a
  program reading a line waits for: `unzip` and `zstd` wait at their
  overwrite question until Ctrl+J. The measurement and a design are in
  [more packages](../20261012-230015-more-packages/TASK.md) (audit 17).
- `pty@0`: a spawn that is not the caller's child (tmux starting its own
  server), a terminal recorded per process, `pipe-pane`
  ([tmux](../20261012-130814-tmux/TASK.md)).
- `nena@0`: credential stripping by a list of six header names, the test
  surface every page ships, every provider's script loaded on every page,
  the page's own parser of recipes (audit B5 to B8).
- `amy`: the file list without the download, `remove`, and a failed start
  naming the package (`src/slop.c`).
- Packages wanted and not made: `chmod` (waits for
  [file modes](../20261006-120641-umask/TASK.md)), `file`, and formatted
  pages for `less`, `ninja`, `posix`, Python, Emacs, Cargo, Rust, `fd`,
  CMake ([man and --help](../20261005-220754-man-help/TASK.md)).
- The fluid demo's GPU test passes in Chrome on the GPU; its Firefox half
  does not (2026-10-13, not attributed, and never run by a round before the
  runner was fixed today): Playwright's Firefox draws no frame on an Xvfb
  display and the wait times out; started as the installed Firefox, as
  Mojo's test does, it draws and then fails "Smoke mode did not change
  pixels".
- At their next rebuild: `xonotic-build` and `wine-build` install `libpng`
  and `freetype`; `gamedev-sdk` drops its `/usr/lib/libm.a`.
- `qwen3.5-4b` is one package of four rows now; the four shard packages stay
  until Pi's `/local` installs the one.
- From tmux in use ([task](../20261013-133111-tmux-use/TASK.md)): the
  display's terminal reports the mouse to no program, so tmux's mouse (and
  nvim's) does nothing: reporting it to a program that asks is in
  `src/ghostty/display.c`, an image input. And the comment on
  `dolly_terminal_write_bytes` in `abi/dolly-supervisor-0.wat`, pinned in the
  docs package, should say that the supervisor's words go to the terminal of
  the process being launched (`2fcc6c62`). tmux's window names and a new
  pane's directory wait for a way to ask the kernel which program holds a
  terminal ([ps](../20261013-132514-ps/TASK.md)).
