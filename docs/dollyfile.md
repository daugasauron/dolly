# Dollyfile 4

A Dollyfile is an ordered recipe that `/bin/dollyfile` executes inside Wasm to
build an image. An image recipe (`/Dollyfile` for `default`, otherwise
`/Dollyfile-NAME`) ends with its entry program; a module (`/modules/NAME.dm`)
is a reusable group of steps. Steps run in order in one filesystem and
environment and may overwrite or delete earlier results. The source viewer
(`/view/IMAGE/`) links modules, assertions, inputs and images; it does not prove
that the programs work.

```text
DOLLY 4
IMAGE example

FROM HOST /Dollyfile-pi <sha256>

FILE /tmp/example.c
    #include <stdio.h>
    int main(void) { puts("hello from an additional tool"); }
SLOP cc /tmp/example.c -o /usr/bin/example
EXPORTS TOOL example

ENTRY /bin/slop
```

This starts from the completed Pi image and builds one more command; the base's
compiler, shell and tools are reused and its entry program never runs.
[`Dollyfile-gpu-fluid`](../Dollyfile-gpu-fluid) fetches pinned upstream code with
`SOURCE URL` and builds it inside Dolly.

## Text

- A recipe is UTF-8 text of at most 128 KiB without NUL bytes. Lines end at
  LF, CRLF or CR.
- Each physical line is read on its own. A `#` that starts a word outside quotes
  and is not escaped begins a comment that ends with the line.
- After its comment and trailing spaces/tabs are removed, a line ending in `\`
  continues: the backslash is dropped and the next physical line is appended
  after one space. An empty or comment-only line ends the continuation; a
  continuation on the last line is an error. A joined line is at most 64 KiB.
- Words are separated by ASCII whitespace. `'…'` is literal. Inside `"…"`, `\`
  escapes only `$`, `` ` ``, `"` and `\` and is otherwise kept. Elsewhere `\`
  escapes the next character. An unclosed quote is an error. Values
  are literal: expansion happens only inside a `SLOP` command.
- Blank and comment-only lines are ignored. The first declaration is `DOLLY 4`;
  the second is `IMAGE name` or `MODULE name`.
- `FILE /path` may be followed by a body: the next physical lines that begin
  with four spaces. Those four spaces are removed and each body line ends with
  LF. The first line without them ends the body, so a blank body line needs four
  spaces; tabs do not count. Body text is literal: no comments, quotes or
  continuations.

## Declarations

| Declaration | Meaning |
| --- | --- |
| `DOLLY 4` | Language version. |
| `IMAGE name` | Image identity: `[a-z][a-z0-9-]*`, at most 32 bytes. |
| `MODULE name` | Module identity, at most 64 bytes; the file must be `/modules/name.dm`. |
| `FROM HOST /Dollyfile[-name] SHA256` | Image only, first operation: start from that completed image. |
| `COPY FROM HOST /Dollyfile[-name] SHA256 SOURCE DESTINATION` | Copy a retained file or tree out of a completed image. |
| `USE HOST /modules/name.dm SHA256` | Run the module here. |
| `SOURCE HOST /path DESTINATION SHA256` | Download a file published by this site. |
| `SOURCE URL http(s)://… DESTINATION SHA256` | Download an external file. |
| `SLOP [CWD /directory] command…` | Run a Slop command; failure stops the build. |
| `FILE /path` | Write the body, if any, then retain the regular file. |
| `FOLDER /path` | Retain the directory and its current members. |
| `EXPORTS TYPE name …` | Offer an object when the recipe finishes. |
| `REQUIRES TYPE name` | Check that an object is available at this point. |
| `REQUIRES HOST name@abi` | The image needs this host provider to run. |
| `ENTRY /program [argument…]` | Image only, last declaration: the program the image runs. |

Paths are absolute and normalized: no trailing `/`, `//`, `.` or `..` segment,
backslash, CR or LF, and less than 4096 bytes. Only `COPY` paths and `SLOP CWD`
may be `/`. `SOURCE HOST` paths have no `?` or `#`; `SOURCE URL` has no `#`.
`SHA256` is 64 lowercase hex digits of the exact referenced bytes.
`node scripts/update-module-pins.mjs` refreshes USE/FROM/COPY pins through the
catalog; `--sources` also refreshes local `SOURCE HOST` inputs.

These paths are never retained: `/tmp`, `/workspace`,
`/home/dolly/.pi/agent/auth.json`, `/home/dolly/.pi/agent/sessions` and their
contents. `FILE` may write scratch files under `/tmp/`; `FOLDER`, exports and
`COPY` destinations may not name them. This is not a secret scanner: never
retain credentials elsewhere.

## Execution

- `SLOP` runs `/bin/slop -e -c COMMAND` in `/` or the `CWD` directory, with
  stdin from `/dev/null`. `COMMAND` keeps its original quoting. Each `SLOP` is a
  new shell: `cd` and variable assignments end with it. Use `SLOP CWD` and
  `EXPORTS ENV`.
- `USE` checks the pin and runs the module in the same filesystem and
  environment; repeated uses run again. A module may use undeclared tools; a
  failure reports the responsible recipe and line. USE nesting is at most 16
  recipes deep, counting the image; cycles are errors.
- `FROM` restores the image's retained files, environment and exports, but not
  its entry. `COPY FROM` maps `SOURCE` to `DESTINATION`: directories merge,
  existing files are replaced and a missing source fails. It imports no
  environment, exports or host requirements. Imported images are separate,
  earlier builds (up to 2 GiB each) and contribute their recipe provenance. An
  image cannot share its name with an image it imports.
- `SOURCE` downloads through the HTTP broker, creating parent directories, and
  replaces `DESTINATION` only after the digest matches. HOST paths are relative
  to the site. The broker still decides which URLs are reachable; a recipe
  cannot grant itself network access. Downloads are not retained by
  themselves.
- `EXPORTS ENV NAME VALUE` sets the variable now; `EXPORTS ENV NAME APPEND
  VALUE` appends `:VALUE` (or sets it when empty); `EXPORTS ENV NAME` keeps the
  current value, which must be set when the recipe finishes.
  `EXPORTS ENV NAME APPEND` sets the value `APPEND`. The final
  values of every exported variable are stored in the image; loading a base does
  not replay assignments.

## Exports, assertions and retention

| Export | Object |
| --- | --- |
| `EXPORTS TOOL name [SHA256]` | The command `name` found on `PATH` when the recipe finishes; the optional digest checks its bytes. |
| `EXPORTS FILE name /path`, `EXPORTS LIB name /path` | A regular file. |
| `EXPORTS FOLDER name /path` | A directory and its members when the recipe finishes. |
| `EXPORTS HEADER name /path` | A file or directory. |
| `EXPORTS ENV NAME [[APPEND] VALUE]` | An environment variable. |

ENV names match `[A-Za-z_][A-Za-z0-9_]*`; other names match
`[A-Za-z][A-Za-z0-9._+-]*` or are `[`; both have at most 128 bytes. Objects are
captured when their recipe finishes, so an export may precede the files it
names. A repeated export replaces the earlier one. A module's exports are
visible to its caller's later steps. An image retains its own exports and those
of the modules it uses directly; a module passes on a child's object by
exporting it again.

`REQUIRES TOOL name` checks `PATH`; `REQUIRES ENV NAME` checks the
environment; other types check that an earlier visible export still exists with
its kind. Assertions are optional and need no declared provider.

The finished image keeps only retained paths: `FILE` and `FOLDER` paths,
exported objects, `FROM` and `COPY` results, and its recipes. Everything else is
dropped, so scratch files need no cleanup, although removing large build trees
lowers peak memory. Deleting a retained path removes it from the image. `ENTRY`
and its resolved target must be retained regular files. `ENTRY` has at most 256
words of at most 4096 bytes; its record (16 bytes, plus 4 per word and the
words) is at most 64 KiB.

## Host requirements

```text
DOLLY 4
IMAGE gpu-app
FROM HOST /Dollyfile-system <sha256>
REQUIRES HOST gpu@0
REQUIRES HOST display@0
# Build or copy your program here.
ENTRY /usr/bin/gpu-app
```

`name@abi` is a provider name of at most 31 bytes (`[a-z][a-z0-9-]*`) and an
ABI revision from 0 to 65535. `REQUIRES HOST` may appear anywhere in an image or
module. Requirements propagate through `FROM` and `USE`, not `COPY`. An image requires at most 64 providers, each at one revision:
conflicting revisions are errors. Requirements are recorded in the artifact and
checked before ENTRY, including for custom images and restored sessions; an
unknown, disabled or incompatible provider fails with its name. Runtime is the
mandatory base. Requirements grant no authority: the embedding chooses
providers and the HTTP broker controls network access. The system shell
declares display, HTTP, upload, download and snapshots; GPU and audio images
add their providers and Slopyard adds threads. Installing a compiler or SDK
enables none of them.

Build hosts supply their own providers. Compiling a GPU program needs no GPU;
running one during the build does, so check pure compute or physics instead of
graphics startup. C programs include `<dolly/gpu.h>` and link `-ldolly-gpu`;
linked client archive members record `gpu@0` in the executable's `dolly.host`
section, and commands and libraries are checked again when loaded. Disabled
providers keep typed denial bindings: calling one returns `ENOSYS`, so an image
whose program needs, say, downloads declares `REQUIRES HOST download@0`. These
records describe compatibility, not permissions.

Threaded C/C++ programs compile and link with `-pthread`; an image whose entry
needs them declares `REQUIRES HOST threads@0`. The profile supports pthreads
and `std::thread` with separate stacks/TLS and shared process files, using Wasm
atomics. It rejects dynamic libraries/runtime FFI, asynchronous cancellation,
directed thread signals, scheduling hints and protected stack guards. See
[the browser boundary](browser-boundary.md) for provider ownership.

## Entry and startup

The browser runs the retained `ENTRY` once. Startup, `.dollyrc`, foreground
ownership and recovery belong to image scripts. Frontend images enter
`/bin/foreground -i /bin/slop /etc/dolly/init.slop`, whose startup launches the
program and then a recovery shell; reusable runtime images enter
`/bin/foreground -i /bin/slop`. See [process lifecycle](process-model.md#cancellation).

## Checking recipes

`npm run lint:dollyfiles` (also part of the source tests) parses every catalog
image graph and checks its pins, module names, USE depth and host
requirements. It fetches and runs nothing: only an image build checks sources,
commands and outputs. Catalog images must be named after their file.
Nonempty `modules/*.dm` files are published as pinned sources even when no
image uses them; a custom recipe can `USE` one at its current hash. That does
not stage its `SOURCE HOST` inputs.

## Custom images and Studio

Open `/custom/` (**Run a Dollyfile**), paste a recipe or select a file, then
build and run it in a fresh sandbox. FROM/COPY/USE pins must match images and
modules published by that site. Custom images can be saved as named sessions
([sessions](sessions.md)).

`/dollyfile-studio/` starts Pi with Neovim, local WebGPU models and a Dollyfile
skill. In Neovim, directives are highlighted and lint errors refresh on open,
save and after edits; `:DollyLint` checks immediately. `dollyfile-lint FILE`
checks one file's syntax with this parser inside QuickJS; it does not follow
USE or FROM. `dollyfile-build /workspace/Dollyfile` builds in a disposable
sandbox and streams its log; see [the build service](image-build-service.md).
Use `download` to export a recipe; `upload /workspace/NAME` imports a local file
the user chooses ([download and upload](download.md)).

## Build reuse

Images, not modules, are cached: expensive compilers and SDKs live in reusable
builder images and frontends copy only their outputs. The recipes define the
graph; there is no dependency solver. The browser uses a verified local artifact,
then a matching published one, and otherwise builds a missing dependency in a
disposable Wasm instance before its consumer. Builds run one at a time and
share the HTTP policy. A cache identity is the runtime build ID, the root
recipe hash and the snapshot digests of its direct FROM/COPY images, so a
dependency rebuilt into different bytes invalidates its consumers. Unpinned
downloads inside `SLOP` are not made reproducible; change a pin or rebuild.
An explicit rebuild reruns the selected image and reuses its imported
artifacts. Descriptor/payload pairs publish and prune atomically.

`npm run image -- IMAGE` stages the image's local sources, refreshes their
`SOURCE HOST` pins and recipe references, and builds with the existing runtime;
`--package` creates a local preview release for `npm run serve`. `SOURCE URL`
pins are never refreshed automatically. Rebuild the runtime separately after
changing the kernel, the seed or this executor.

Published images share content-addressed, compressed packs of identical
filesystem records (path, kind and contents), split into 2–4 MiB groups where
possible. The browser reconstructs and verifies each exact snapshot before
restoring it; the Wasm filesystem has no layers.
