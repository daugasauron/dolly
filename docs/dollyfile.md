# Dollyfile 6

A Dollyfile is an ordered recipe that `/bin/dollyfile`
([`dollyfile.c`](../src/dollyfile.c)) executes inside Wasm to build an image.
A recipe declares its role on its second line: an `APPLICATION` that people
open, a `TOOLCHAIN` that other recipes build on, or a `PACKAGE` that recipes
and sessions install. Steps share one filesystem and environment and run in
order.

```text
DOLLY 6
APPLICATION example
REQUIRES HOST display@0

FROM https://daugasauron.com/Dollyfile-system <sha256>
INSTALL https://daugasauron.com/demos/javascript/Dollyfile-javascript <sha256>

FILE /tmp/example.c
    #include <stdio.h>
    int main(void) { puts("hello"); }
SLOP cc /tmp/example.c -o /usr/bin/example
EXPORTS TOOL example

ENTRY /bin/foreground -i /bin/slop
```

Recipes name every image and file they read by full URL with its SHA-256.
Catalog recipes, module headers and prepared sources are published at their
checkout path on one canonical origin, `https://daugasauron.com`: core recipes
at the top level, demo recipes in `/demos/DEMO/`
([`recipe-files.mjs`](../scripts/recipe-files.mjs)), headers in `/include/dolly/`
and `/host/MODULE/`, prepared sources in `/dist/static/`.

## Text

- UTF-8, at most 128 KiB, no NUL. Lines end at LF, CRLF or CR.
- A `#` that starts an unquoted, unescaped word begins a comment to end of line.
- After comments and trailing blanks are removed, a trailing `\` joins the next
  physical line with one space. An empty or comment-only line ends the
  continuation; a continuation on the last line is an error. Joined lines are at
  most 64 KiB.
- Words split on ASCII whitespace. `'…'` is literal. Inside `"…"`, `\` escapes
  only `$`, `` ` ``, `"` and `\`. Elsewhere `\` escapes the next character.
  Unclosed quotes are errors. Values are literal: expansion happens only inside
  `SLOP`.
- The first declaration is `DOLLY 6`, the second the role and name.
- `FILE /path` may be followed by a body: the following lines that start with
  four spaces, which are removed; each line ends with LF. A blank body line needs
  the four spaces; tabs do not count. Body text is literal.

## Roles and names

| Role | Opened by | Imported by | ENTRY | Keeps |
| --- | --- | --- | --- | --- |
| `APPLICATION name` | people, at `/name/` | `FROM` | required, last | its base and everything it declares |
| `TOOLCHAIN name` | people, when it has ENTRY | `FROM` | optional, last | its base and everything it declares |
| `PACKAGE name` | nobody | `INSTALL` | none | only what it declares |

- `COPY` takes files out of an image of any role.
- Names match `[a-z][a-z0-9]*(-[a-z0-9]+|\.[0-9]+)*` and are at most 32 bytes: a
  dot starts a run of version digits (`qwen3.5-4b`, `python3.14`), so a
  documentation copy such as `Dollyfile-example.txt` is never a recipe.
- A recipe is the file `Dollyfile-NAME` (`Dollyfile` for `default`); the URL
  that imports it must name that file.
- Catalog convention: applications and packages take the product's name
  (`pi`, `ripgrep`, `python`); toolchains are `family-variant`
  (`rust-sdk`, `cmake-build`, `pi-runtime`); versions go in the family
  (`qwen3.5-4b`). When an application already has the product's name, the
  package takes another name the project uses (`nvim`, `pi-coding-agent`). The
  start page lists images by role, toolchains grouped by their directory.
- `/etc/dolly/recipes/` retains every recipe an image was built from, by file
  name; `/etc/dolly/Dollyfile` is the image's own.

## Declarations

| Declaration | Meaning |
| --- | --- |
| `DOLLY 6` | Language version. |
| `APPLICATION name`, `TOOLCHAIN name`, `PACKAGE name` | Role and name. |
| `REQUIRES HOST name@abi` | The image uses this host module when it runs. |
| `FROM URL SHA256` | First operation: start from a completed application or toolchain. |
| `INSTALL URL SHA256` | Import a completed package: its files, exports and environment. |
| `COPY URL SHA256 SOURCE DESTINATION` | Copy a retained file or tree out of a completed image. |
| `SOURCE URL SHA256 DESTINATION` | Download a file. |
| `RUN [CWD /directory] /program [word…]` | Run a program; failure stops the build. |
| `SLOP [CWD /directory] command…` | `RUN /bin/slop -e -c command`. |
| `FILE /path` | Write the body, if any, and retain the file. |
| `FOLDER /path` | Retain the directory and its members. |
| `EXPORTS TYPE name …` | Offer an object when the recipe finishes. |
| `REQUIRES TYPE name` | Assert that an object is available here. |
| `ENTRY /program [word…]` | Last declaration: the program the image runs when opened. |

- Paths are absolute and normalized: no trailing `/`, `//`, `.`, `..`,
  backslash, CR or LF; under 4096 bytes. Only `COPY` paths and `CWD` may be
  `/`.
- URLs are absolute `http(s)://` with a host, no fragment and no whitespace or
  `\`. `FROM`, `INSTALL` and `COPY` URLs name `Dollyfile` or `Dollyfile-name`,
  with no query.
- `SHA256` is 64 lowercase hex digits of the exact referenced bytes.
  `node scripts/update-recipe-pins.mjs` refreshes recipe pins (`--sources`
  also the pins of prepared canonical sources).
- Pins stay inline and cascade: each pin covers everything the referenced
  recipe pins, so a change anywhere changes the hash of every recipe that
  depends on it and rebuilds those images. That is intended: every image is
  completely replicable from its recipe chain.
- Never retained: `/tmp` and `/workspace`. `FILE` may write scratch under
  `/tmp/`; `FOLDER`, exports and `COPY` destinations may not. Retention is
  explicit, so a recipe keeps credentials or sessions only by naming them.

## Execution

- `RUN` spawns the program with the following words as its arguments, in `/`
  or `CWD`, with stdin `/dev/null`: no shell and no expansion. The words follow
  the ENTRY limits. The program must exist by then: a root build has only the
  seed compiler, `/usr/libexec/dolly/process-bin/compiler
  --dolly-toolchain-mode=c`, until it compiles Slop and the compiler front ends
  ([`Dollyfile-system-build`](../Dollyfile-system-build)).
- `SLOP` runs `/bin/slop -e -c COMMAND`, keeping the command's quoting. Each
  `SLOP` is a new shell: use `CWD` and `EXPORTS ENV` instead of `cd` and
  assignments. A `SLOP` step before the recipe has `/bin/slop` fails, naming
  the line; the language defines the dependency, so `REQUIRES TOOL slop` is an
  error.
- `FROM` restores the image's retained files, environment and exports, not its
  ENTRY or host requirements. An application or toolchain keeps all of it. A
  package keeps none of it: the base is only the environment the package is
  built in.
- `INSTALL` restores a package's retained files, applies and exports its
  environment and exports its objects. It may appear anywhere and names only a
  package. It imports the package's contents, not the files that describe the
  package image (`/etc/dolly/Dollyfile`, `artifact`, `environment`, `image`,
  `image.manifest`, `recipes.lock`). The package's `REQUIRES HOST` lines must
  all be declared by the installing recipe, or the row fails naming the missing
  line before it changes a file. A package built from another release of the
  same recipe fails the install: an image carries one pin per recipe.
- `COPY` merges directories, replaces files and fails on a missing source; it
  imports no environment, exports or host requirements. Imported images are
  earlier builds of at most 2 GiB; an image cannot share a name with one it
  imports.
- `SOURCE` downloads through the HTTP broker, creates parent directories and
  replaces `DESTINATION` only after the digest matches. Downloads are not
  retained by themselves.
- Where bytes come from never changes a recipe or its identity; pins cover
  content. The page serves its own copy of every file its release publishes on
  the canonical origin (a mirror), so `npm run serve`, the test server and image
  builds build an unpublished checkout from its own files. The page grants
  exactly those files to builds ([HTTP](http.md)); other URLs are external and
  pass only if the embedding's HTTP policy allows them. A recipe never grants
  itself network access. Upstream hosts often send no CORS headers, so upstream
  archives are staged and published on the canonical origin
  ([sources](sources.md#pins-and-identity)).
- `EXPORTS ENV NAME VALUE` sets the variable now; `EXPORTS ENV NAME APPEND VALUE`
  appends `:VALUE` (or sets it when empty). Final values are stored in the image.

## Exports, assertions and retention

| Export | Object |
| --- | --- |
| `EXPORTS TOOL name` | The command `name` on `PATH` when the recipe finishes. |
| `EXPORTS FILE name /path`, `EXPORTS LIB name /path` | A regular file. |
| `EXPORTS FOLDER name /path` | A directory and its members. |
| `EXPORTS HEADER name /path` | A file or directory. |
| `EXPORTS ENV NAME [APPEND] VALUE` | An environment variable. |

- ENV names match `[A-Za-z_][A-Za-z0-9_]*`; other names match
  `[A-Za-z][A-Za-z0-9._+-]*` or are `[`; at most 128 bytes.
- Objects are captured when their recipe finishes, so an export may precede its
  files; a repeated export of the same type and name replaces the earlier one,
  and a recipe's own exports win over imported ones wherever they appear.
- An image exports its own objects plus those of the packages it installs and,
  unless it is a package, those of its base. It retains every object it exports.
- `REQUIRES TOOL` checks `PATH`, `REQUIRES ENV` the environment, other types an
  earlier visible export of that kind: the recipe's own, a package's or the
  base's.
- The image keeps only `FILE` and `FOLDER` paths, exported objects, `FROM`,
  `INSTALL` and `COPY` results, and its recipes. Scratch needs no cleanup. ENTRY
  and its target must be retained regular files; ENTRY and RUN have at most 256
  words of at most 4096 bytes and a record of at most 64 KiB.

## Host requirements

- `REQUIRES HOST name@abi` describes running the image: a module name of at
  most 31 bytes (`[a-z][a-z0-9-]*`) and a revision 0–65535, at most 64 per
  image, one revision each. They follow the role line, before every other
  declaration, as the image's manifest.
- They are never inherited: `FROM`, `INSTALL` and `COPY` carry none into the
  consumer and nothing is derived. The image's own recipe is the complete list.
  A package declares the modules its programs need; `INSTALL` checks that the
  installing recipe declares them too.
- Sealing checks every retained executable: a `dolly.host` record naming a
  module the recipe does not declare fails the build, naming the file and the
  `REQUIRES HOST` line to add. Builds themselves get the build host's modules.
- At run time the image may use only its declared modules: boot fails if the
  embedding lacks one, and the loader refuses an executable whose stamped
  module is not declared. Requirements grant nothing: the embedding enables
  modules and the HTTP broker decides network access
  ([browser boundary](browser-boundary.md)). `system` declares display, http,
  download, upload and snapshot; `default` adds packages and threads.
- Linked client libraries (`-ldolly-gpu`, `-ldolly-audio`) stamp their module
  and its ABI digest into the executable's `dolly.host` section; loading fails
  for an unknown module or a different layout. Calling a disabled module
  returns `ENOSYS`. `-pthread` programs need `REQUIRES HOST threads@0`
  ([process model](process-model.md#threads-dsos-and-ffi)).

## Entry and startup

The browser runs the retained ENTRY once, and only an image with ENTRY and
`display@0` can be opened. Applications enter
`/bin/foreground -i /bin/slop /etc/dolly/init.slop`, which starts the program
and then a recovery shell; toolchains that can be opened enter
`/bin/foreground -i /bin/slop`.

## Packages and amy

A package is the unit of reuse: a lean image that holds only the files,
exports and environment it declares, built in a toolchain (`FROM`) or from
nothing, and installed by recipes and sessions with the same row.

```text
DOLLY 6
PACKAGE ripgrep
REQUIRES HOST threads@0

FROM https://daugasauron.com/demos/rust/Dollyfile-rust-build <sha256>
…
EXPORTS TOOL rg
```

- A recipe installs it with `INSTALL URL SHA256`, anywhere.
- Packages install into standard paths (`/usr/bin`, `/usr/lib`, `/usr/share`)
  and set environment variables only for their own use: an installed value
  replaces the importer's.
- The release publishes the package index, `dist/dolly-packages.txt`, one
  `NAME URL SHA256` line per package, so a session can name a package and get
  its `INSTALL` row.
- `amy install NAME` ([`amy.c`](../src/commands/amy.c)) executes that row in a
  running session: the index names the package, the page's `packages@0`
  service ([browser boundary](browser-boundary.md#host-modules)) hands over its
  verified snapshot, and `dollyfile install URL SHA256` restores the files,
  merges the exported variables into `/etc/dolly/environment` and appends the
  row to `/etc/dolly/installed`. `amy list` marks the installed index entries
  and `amy installed` prints the record. The check is the recipe's: a package
  whose host modules the booted image does not declare is refused by name.
  Looking a name up in the index is the only unpinned step.
- Installed files are session files, within the 512 MiB a save holds. Exported
  variables apply when the session is next loaded; the current shell keeps its
  environment ([sessions](sessions.md)).

## Building

```mermaid
flowchart TD
  recipe["Dollyfile, pinned"] --> exec
  bases["FROM / INSTALL / COPY images: cached, published or built first"] --> exec
  inputs["SOURCE URLs via the HTTP broker"] --> exec
  exec["/bin/dollyfile in a fresh runtime"] --> snap["Sealed snapshot: retained files, env, ENTRY"]
  snap -- "npm run image: headless Chrome on /IMAGE/rebuild/" --> packs["dist/ snapshot, packaged as shared packs"]
  snap -- "/IMAGE/rebuild/ in a browser" --> cache[("IndexedDB image cache")]
  packs --> boot["/IMAGE/: prebuilt boot"]
```

- A root build (no `FROM`) loads the compiler seed and compiles
  `/bin/dollyfile` first ([`bootstrap.c`](../src/process/bootstrap.c)); the
  recipe builds everything else, Slop included. Other builds restore their
  base image.
- Every image is cached. A cache identity is the image build ID, the recipe
  hash and the snapshot digests of its direct `FROM`, `INSTALL` and `COPY`
  images. The browser uses a verified local artifact, then a published one,
  and otherwise builds the missing dependency in a disposable runtime first.
  Unpinned downloads inside a `SLOP` command are not made reproducible by the
  cache.
- Multi-stage builds: toolchains stay in images that are only built, packages
  and applications keep exact outputs, and the consumer keeps the builder's
  recipe chain in `/etc/dolly/recipes` as provenance. There is no catalog-wide
  solver.
- Images without ENTRY only build: their route shows the log.
- Published images share content-addressed compressed packs of identical file
  records, deduplicating distribution without layer mounts in WasmFS; the
  browser rebuilds and verifies each exact snapshot before restoring.
- `npm run image -- IMAGE` stages local sources, refreshes canonical source and
  recipe pins and builds with the existing runtime; `--plan` only shows what
  would rebuild. External source pins are never refreshed automatically.
- Images whose dependencies are complete build concurrently, one headless Chrome
  each; `DOLLY_IMAGE_JOBS` overrides the count chosen from available memory.
  Each build's log is in `build/image-logs/IMAGE.log`; a failed image skips
  only its dependents and fails the command.
- `npm run lint:dollyfiles` checks every catalog graph (pins, names, roles,
  host requirements) without running anything.

## Custom images and Studio

`/custom/` builds a pasted or uploaded recipe in a fresh sandbox; its `FROM`,
`INSTALL` and `COPY` URLs must name images the release publishes on the
canonical origin. Dollyfile Studio adds Pi, Neovim linting and
`dollyfile-build FILE` ([Studio builds](image-build-service.md)). Custom
images can be saved as [sessions](sessions.md).
