# Dollyfile version 1

A Dollyfile is the source-visible, sequential recipe for one Dolly userspace
image. It says which exact bytes enter the sandbox, which commands build them,
which checks must pass, which files survive snapshotting, and which executable
starts when the image boots.

The authoritative parser and executor is the C program in
[`src/dollyfile.c`](../src/dollyfile.c). It is compiled by Clang inside Dolly,
installed as `/bin/dollyfile`, and run as an ordinary Dolly executable. The
browser does not parse or execute build rows. JavaScript only discovers image
names for routes and renders source text for the viewer.

## Execution model

Rows execute strictly from top to bottom.

- A `SOURCE` request must finish, satisfy its byte limit and SHA-256, and be
  written to its destination before the next row is parsed.
- `RUN` and `CHECK` launch `/bin/slop -e -c ...` and wait for its status before
  execution continues.
- `EXTENDS` fetches and executes the parent at that exact row. The child then
  resumes at the following row.
- The first failed fetch, parse, build, or check aborts the image.

There is no parallel prefetch phase, hidden dependency solver, automatic
archive extraction, permission layer, or package manager. If a recipe uses an
archive, an earlier row must have built an extractor. The default image starts
by fetching the small C source for `tar`, compiling it inside Dolly, and only
then requesting source archives.

## Grammar

Blank lines and comments beginning with `#` are ignored. A trailing `\`
continues a logical row. Version 1 supports:

```text
DOLLY 1
IMAGE <name>
EXTENDS <image>
SOURCE HOST|URL BIN|TXT <location> <absolute-destination> SHA256 <64-hex>
ENV <name>=<value>
WORKDIR <absolute-directory>
RUN <slop-command>
CHECK <slop-command>
KEEP <absolute-file>
KEEP-TREE <absolute-directory>
ENTRY <absolute-executable> [argument ...]
```

`DOLLY 1` must be the first declaration. It selects this grammar and has no
runtime behavior by itself.

`IMAGE` gives the selected image its stable route and identity name. Names use
lowercase ASCII letters, digits, and hyphens. The repository file is
`Dollyfile` for `default`, or `Dollyfile-<name>` for another image.

`EXTENDS` is optional and must appear after `IMAGE` and before action rows. The
browser supplies only the initial recipe locator. The C engine resolves
`default` to `/Dollyfile` and another parent to `/Dollyfile-<name>`, then fetches
it through the same HTTP broker used for every other network request.

`SOURCE` acquires one independent pinned input:

- `HOST` resolves a root-relative location against the deployment base. A
  deployment under `/dolly/` therefore resolves `/static/x` beneath that base,
  not at the origin root.
- `URL` is an absolute HTTP(S) URL.
- `BIN` and `TXT` describe presentation only. Both write the exact response
  bytes. The source viewer offers `BIN` as a download and displays or links
  `TXT` as text.
- The destination is an absolute Dolly path. The C engine creates parent
  directories, streams into a temporary file, verifies SHA-256, and publishes
  only verified bytes.
- No media type causes decompression, parsing, execution, or code generation.

All `HOST` and `URL` traffic crosses `env.dolly_http_dispatch`, Dolly's sole
intentional agent-selected network import. Repository `HOST` inputs are added
to the browser policy as exact credential-free GET capabilities with exact
response-size ceilings. General URL authority remains embedding policy; a
Dollyfile declaration never grants itself network access.

`ENV` updates the persistent userspace environment. `WORKDIR` changes the
shared current directory, including `/`.

`RUN` and `CHECK` currently have the same fail-fast execution semantics. The
separate names communicate intent: `RUN` produces the image, while `CHECK`
demonstrates a required result and is suitable for audit/test reporting.

`KEEP` names one regular file. `KEEP-TREE` recursively expands a directory to
regular files after all rows finish. A missing path, directory passed to
`KEEP`, non-directory passed to `KEEP-TREE`, special file, or forbidden mutable
session path fails sealing. `/tmp`, `/workspace`, Pi credentials, and Pi
sessions cannot be retained. Dolly automatically retains its canonical recipe
chain and image control files.

`ENTRY` is an absolute executable plus fixed arguments. It is serialized to a
small versioned binary record at `/etc/dolly/entry`; no shell reparses it at
boot. The default image uses:

```text
ENTRY /usr/bin/pi --no-session
```

There is deliberately no `DECLARE HTTP` directive. Network requirements may
become descriptive metadata later, but recipes cannot alter the browser's
authority or credential policy.

## Outputs and identity

Successful execution writes:

```text
/etc/dolly/Dollyfile                    canonical selected recipe
/etc/dolly/recipes/<image>.Dollyfile    every recipe in the inheritance chain
/etc/dolly/recipes.lock                 locator and SHA-256 for each recipe
/etc/dolly/image                        selected image name
/etc/dolly/entry                        binary entry record
/etc/dolly/image.manifest               sorted retained-file paths
```

The outer snapshot builder captures exactly the files in
`/etc/dolly/image.manifest`. Its metadata binds the opaque snapshot to:

- the runtime build ID;
- snapshot format version;
- image name;
- exact raw recipe bytes, lengths, and SHA-256 values for the visible chain;
- serialized entry arguments;
- retained-path manifest;
- snapshot byte length and SHA-256.

Prebuilt boot validates that metadata against the source-visible repository
recipes before restoring. Rebuild boot fetches the recipes and sources through
the broker and produces a new snapshot inside the sandbox.

## Images and routes

[`scripts/image-definitions.mjs`](../scripts/image-definitions.mjs) discovers
repository Dollyfiles and independently verifies every `HOST` input on disk.
It generates image/source metadata and these routes:

```text
/default/             restore the default snapshot
/default/rebuild/     execute Dollyfile and export a default snapshot
/gamedev/             restore the gamedev snapshot
/gamedev/rebuild/     execute Dollyfile-gamedev, including EXTENDS default
/python/              restore the CPython snapshot
/python/rebuild/      execute Dollyfile-python, including EXTENDS default
/load/?session=NAME   restore a named browser-local WasmFS session
/view/default/        styled source viewer
/view/gamedev/        styled source viewer
/view/python/         styled source viewer
/custom/rebuild/      execute a bounded user-selected text recipe
```

The root menu is generated from the same definitions. A custom recipe remains
in the current tab and must directly extend `default`; the C engine remains the
authoritative parser once the fresh sandbox starts.

## Current boundary

Version 1 intentionally optimizes for inspectability rather than convenience.
It has no variables, conditionals, implicit caches, mounts, secrets, build
contexts, layers, shell selection, or permission directives. Host build scripts
still prepare deterministic upstream subsets and archives, but every browser
build input is visible as an independent `SOURCE` row and verified before use.

The next useful evolution is a content-addressed cache or capsule format that
preserves this exact row-by-row semantics. It should not reintroduce a hidden
JavaScript executor or broaden the browser capability boundary.
