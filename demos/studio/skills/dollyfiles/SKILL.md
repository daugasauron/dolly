---
name: dollyfiles
description: Write, lint and build Dollyfile (DOLLY 6) recipes for custom Dolly images and packages in Dollyfile Studio - roles, REQUIRES HOST, FROM, INSTALL, RUN and SLOP steps, finding URLs and pins, dollyfile-lint and dollyfile-build. Use for any task that creates or changes an image recipe.
---

# Dollyfiles in Studio

`/usr/share/dollyfile-studio/dollyfile.md` is the language reference; read it
before using a declaration you have not seen in an example. The `dolly` skill
describes the machine itself (network, shell, compilers).

## Workflow

1. Start from a copy of an example in `/usr/share/dollyfile-studio/examples/`:
   `Dollyfile-tool` compiles a C command, `Dollyfile-hello` only adds files.
   Their `FROM` lines carry correct pins; keep them.
2. Write the recipe in `/workspace` with Pi's write and edit tools.
3. `dollyfile-lint RECIPE` checks this one file's syntax; it reads no other
   recipe and runs nothing.
4. `dollyfile-build RECIPE` builds it in a fresh, disposable sandbox and
   streams the log; it needs no approval. A build error names the recipe line:
   fix the recipe, lint and build again. Report the actual result.
5. After success the user can click **Open image**; building never changes
   Studio's own files, and the image does not see them.

Never run `/bin/dollyfile` here: it replaces the running image.

## The rules that cost most retries

- Line 1 `DOLLY 6`, line 2 the role: `APPLICATION name` (opened by people;
  needs `ENTRY`), `TOOLCHAIN name` (a base to build on) or `PACKAGE name`
  (installed with `INSTALL` or `amy`; no `ENTRY`).
- `REQUIRES HOST name@0` lines come right after the role and list every host
  module the image uses, `runtime@0` first: every image and package names the
  runtime it is built on. Nothing is inherited from `FROM` or `INSTALL`: an
  application on `system` repeats system's six (runtime, display, download,
  http, snapshot, upload), and installing a package means declaring every
  module that package declares (ripgrep and fd need `threads@0`). Read the package's
  recipe first; otherwise the build fails on the `INSTALL` row, naming the
  missing line.
- `FROM URL SHA256` is the first operation. `INSTALL URL SHA256` adds a
  package anywhere after it. `COPY` takes files out of another image.
- `SLOP command` runs one shell command line in `/`; each is a fresh shell, so
  use `SLOP CWD /dir ...` instead of `cd`. `RUN /program args` runs a program
  without a shell. Any failure stops the build.
- `FILE /path` is followed by body lines indented by exactly four spaces. An
  empty line ends the body (the next line then fails as a directive), so a
  blank line inside the file is four spaces. It is not a heredoc. `FILE` and
  `FOLDER` keep files in the image; build scratch goes in `/tmp`, which is
  never kept.
- The image keeps a compiled program only when the recipe exports it:
  compile to `/usr/bin` and add `EXPORTS TOOL name` (a command on `PATH`).
- `ENTRY` is the last line. `/bin/foreground -i /bin/slop` gives a shell;
  `/bin/foreground -i /usr/bin/name` runs a program, which must be exported
  or the build fails naming the line to add.

## URLs and pins

Every `FROM`, `INSTALL`, `COPY` and `SOURCE` names a URL and the SHA-256 of
its exact bytes; never invent either.

- Packages: `curl -fsS https://packages.dolly.invalid/v1/index` prints
  `NAME URL SHA256` for each, which is the `INSTALL` row.
- Recipes this image was built from (system among them):
  `sha256sum /etc/dolly/recipes/Dollyfile-NAME`, with the URL from the
  `FROM`/`INSTALL` line that names it in another recipe there.
- Any published recipe or file: `curl -fsS URL -o /tmp/x && sha256sum /tmp/x`.
  Recipes live at `https://daugasauron.com/...`; the page serves its own copy.
- Builds may only use images this release publishes. Upstream sources that
  send no CORS headers cannot be `SOURCE`d; see the `dolly` skill.

## Editor and models

For Neovim (highlighting, inline lint, `:DollyLint`) read
[neovim.md](neovim.md); interactive nvim needs the shell after leaving Pi with
Ctrl+D, not Pi's tool. `/model` switches between local and remote models;
`/dolly-hello`, `/dolly-tool` and `/dolly-fix` are starter prompts. `download
RECIPE` saves a recipe to the user's device; Ctrl+Shift+S saves the session.
