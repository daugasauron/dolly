# Dollyfile 6

A Dollyfile is an ordered recipe that `/bin/dollyfile`
([`dollyfile.c`](../src/dollyfile.c)) executes inside Wasm to build an image.
A recipe declares its role on its second line: an `APPLICATION` that people
open, a `TOOLCHAIN` that other recipes build on, a `PACKAGE` that recipes and
`amy` install, or a `MODULE`, a reusable group of steps. Steps share one
filesystem and environment and run in order.

```text
DOLLY 6
APPLICATION example

FROM https://daugasauron.com/Dollyfile-system <sha256>
INSTALL https://daugasauron.com/demos/javascript/Dollyfile-javascript <sha256>

FILE /tmp/example.c
    #include <stdio.h>
    int main(void) { puts("hello"); }
SLOP cc /tmp/example.c -o /usr/bin/example
EXPORTS TOOL example

ENTRY /bin/foreground -i /bin/slop
```

Recipes name every image, module and file they read by full URL with its
SHA-256. Catalog recipes, module headers and prepared sources are published at
their checkout path on one canonical origin, `https://daugasauron.com`: core
recipes at the top level and in `/modules/`, demo recipes in `/demos/DEMO/`
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
| `TOOLCHAIN name` | people, when it has ENTRY | `FROM`, `COPY` | optional, last | its base and everything it declares |
| `PACKAGE name` | nobody | `INSTALL`, `COPY` | none | only what it declares |
| `MODULE name` | nobody | `USE` | none | runs inside its caller |

- Names match `[a-z][a-z0-9]*(-[a-z0-9]+|.[0-9]+)*` and are at most 32 bytes: a
  dot separates version digits.
  Image names are unique in a catalog and so are module names; an image and a
  module may share one (`pi`, `pi.dm`).
- An image recipe is the file `Dollyfile-NAME` (`Dollyfile` for `default`), a
  module `NAME.dm`; the URL that imports a recipe must name its file.
- Catalog convention: applications and packages take the product's name
  (`pi`, `ripgrep`, `python`); toolchains are `family-variant`
  (`rust-sdk`, `cmake-build`, `pi-runtime`); versions go in the family
  (`qwen3.5-4b`). The start page lists images by role, toolchains grouped by
  their directory, and lints the file names.
- `/etc/dolly/recipes/` retains every recipe an image was built from, by file
  name; `/etc/dolly/Dollyfile` is the image's own.

## Declarations

| Declaration | Meaning |
| --- | --- |
| `DOLLY 6` | Language version. |
| `APPLICATION name`, `TOOLCHAIN name`, `PACKAGE name`, `MODULE name` | Role and name. |
| `FROM URL SHA256` | Image only, first operation: start from a completed application or toolchain. |
| `INSTALL URL SHA256` | Import a completed package: its files, exports and host requirements. |
| `COPY URL SHA256 SOURCE DESTINATION` | Copy a retained file or tree out of a completed image. |
| `USE URL SHA256` | Run the module here. |
| `SOURCE URL SHA256 DESTINATION` | Download a file. |
| `SLOP [CWD /directory] command…` | Run a Slop command; failure stops the build. |
| `COMPILEC /source.c /program` | Compile one C file with the seed compiler; failure stops the build. |
| `FILE /path` | Write the body, if any, and retain the file. |
| `FOLDER /path` | Retain the directory and its members. |
| `EXPORTS TYPE name …` | Offer an object when the recipe finishes. |
| `REQUIRES TYPE name` | Assert that an object is available here. |
| `REQUIRES HOST name@abi` | The image needs this host module to run. |
| `ENTRY /program [argument…]` | Last declaration: the program the image runs when opened. |

- Paths are absolute and normalized: no trailing `/`, `//`, `.`, `..`,
  backslash, CR or LF; under 4096 bytes. Only `COPY` paths and `SLOP CWD` may be
  `/`.
- URLs are absolute `http(s)://` with a host, no fragment and no whitespace or
  `\`. `FROM`, `INSTALL` and `COPY` URLs name `Dollyfile` or `Dollyfile-name`
  and `USE` URLs `name.dm`, with no query.
- `SHA256` is 64 lowercase hex digits of the exact referenced bytes.
  `node scripts/update-module-pins.mjs` refreshes recipe pins (`--sources`
  also the pins of prepared canonical sources).
- Pins stay inline and cascade: each pin covers everything the referenced
  recipe pins, so a change anywhere changes the hash of every recipe that
  depends on it and rebuilds those images. That is intended: every image is
  completely replicable from its recipe chain.
- Never retained: `/tmp`, `/workspace`, `/home/dolly/.pi/agent/auth.json`,
  `/home/dolly/.pi/agent/sessions`. `FILE` may write scratch under `/tmp/`;
  `FOLDER`, exports and `COPY` destinations may not. This is not a secret scanner.

## Execution

- `SLOP` runs `/bin/slop -e -c COMMAND` in `/` or `CWD`, stdin `/dev/null`,
  keeping the command's quoting. Each `SLOP` is a new shell: use `SLOP CWD` and
  `EXPORTS ENV` instead of `cd` and assignments.
- `COMPILEC` runs the seed compiler as `cc -O1 /source.c -o /program` in `/`,
  stdin `/dev/null`: no shell, flags or expansion. It exists for the programs a
  root build needs before `/bin/slop` does, Slop itself
  ([`slop.dm`](../modules/slop.dm)) and the compiler front ends
  ([`bootstrap.dm`](../modules/bootstrap.dm)); everything else uses `SLOP cc`.
- `USE` checks the pin and runs the module in the same filesystem and
  environment, again on every use. Failures name the recipe and line. Nesting is
  at most 16 recipes including the image; cycles are errors.
- `FROM` restores the image's retained files, environment and exports, not its
  ENTRY. An application or toolchain keeps all of it. A package keeps none of
  it: the base is only the environment the package is built in, and its exports
  and host requirements stay with the base.
- `INSTALL` restores a package's retained files, applies and exports its
  environment, exports its objects and adds its host requirements. It may appear
  anywhere, in modules too, and names only a package. A package built from
  another release of the same recipe fails the install: an image carries one
  pin per recipe.
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
  files; a repeated export of the same type and name replaces the earlier one.
- Exports are transitive: a recipe's exports are its own plus those of the
  modules it uses and the packages it installs, and are visible to its caller's
  later steps. An image retains every object it exports.
- `REQUIRES TOOL` checks `PATH`, `REQUIRES ENV` the environment, other types an
  earlier visible export of that kind.
- The image keeps only `FILE` and `FOLDER` paths, exported objects, `FROM`,
  `INSTALL` and `COPY` results, and its recipes. Scratch needs no cleanup. ENTRY
  and its target must be retained regular files; ENTRY has at most 256 words of
  at most 4096 bytes and a record of at most 64 KiB.

## Host requirements

- `name@abi`: a module name of at most 31 bytes (`[a-z][a-z0-9-]*`) and a
  revision 0–65535. At most 64 per image, one revision each.
- `REQUIRES HOST` may appear in any recipe and propagates through `FROM`, `USE`
  and `INSTALL`, not `COPY` and not from a package's base. The artifact records
  them; boot checks them before ENTRY and fails with the module's name.
- Requirements grant nothing: the embedding enables modules and the HTTP broker
  decides network access ([browser boundary](browser-boundary.md)). `system`
  declares display, http, download, upload and snapshot.
- Linked client libraries (`-ldolly-gpu`, `-ldolly-audio`) also stamp their
  module and its ABI digest into the executable's `dolly.host` section; loading
  fails for an unknown module or a different layout. Calling a disabled module
  returns `ENOSYS`.
- `-pthread` programs need `REQUIRES HOST threads@0`
  ([process model](process-model.md#threads-dsos-and-ffi)).
- Build hosts supply their own modules: compiling a GPU program needs no GPU,
  running one during the build does.

## Entry and startup

The browser runs the retained ENTRY once, and only an image with ENTRY and
`display@0` can be opened. Applications enter
`/bin/foreground -i /bin/slop /etc/dolly/init.slop`, which starts the program
and then a recovery shell; toolchains that can be opened enter
`/bin/foreground -i /bin/slop`.

## Packages and amy

A package is the unit both recipes and running sessions install: a lean image
that holds only the files and exports it declares, built in a toolchain
(`FROM`) or from nothing.

```text
DOLLY 6
PACKAGE ripgrep

FROM https://daugasauron.com/demos/rust/Dollyfile-rust-build <sha256>
USE https://daugasauron.com/demos/rust/ripgrep.dm <sha256>
```

- A recipe installs it with `INSTALL URL SHA256`. `amy install NAME` executes
  the same row in a running session: `amy` is a front end over
  `/bin/dollyfile`, not a second installer.
- The release publishes the package index, `dist/dolly-packages.txt`, one
  `NAME URL SHA256` line per package; the index is the only unpinned step of an
  install.
- `amy` appends each executed row to `/etc/dolly/installed`. `amy freeze NAME`
  writes the application recipe that rebuilds the session as an image:
  `FROM` the booted image at its pin, the installed rows, and the image's ENTRY.
- Packages install into standard paths (`/usr/bin`, `/usr/lib`, `/usr/share`)
  and set environment variables only for their own use: an installed value
  replaces the session's.
- Trust equals the image cache's: the page materializes a package artifact
  from its verified published snapshot, checks the package's host requirements
  against the enabled modules, and places it at
  `/etc/dolly/artifacts/SHA256.snapshot` before the engine runs the row.

## Building

```mermaid
flowchart TD
  recipe["Dollyfile + modules, pinned"] --> exec
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
- Images, not modules, are cached. A cache identity is the image build ID, the
  root recipe hash and the snapshot digests of its direct `FROM`, `INSTALL` and
  `COPY` images. The browser uses a verified local artifact, then a published
  one, and otherwise builds the missing dependency in a disposable runtime first.
- Modules are never cached by their declared outputs: arbitrary reads,
  overwrites and deletions make that insufficient. Unpinned downloads inside a
  `SLOP` command are not made reproducible by the cache.
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
- `npm run lint:dollyfiles` checks every catalog graph (pins, names, roles, USE
  depth, host requirements) without running anything.

## Custom images and Studio

`/custom/` builds a pasted or uploaded recipe in a fresh sandbox; its `FROM`,
`INSTALL`, `COPY` and `USE` URLs must name images and modules the release
publishes on the canonical origin, which include every module. Dollyfile
Studio adds Pi, Neovim linting and `dollyfile-build FILE`
([Studio builds](image-build-service.md)). Custom images can be saved as
[sessions](sessions.md).
