# Dollyfile version 2

A Dollyfile is a sequential recipe for one userspace image. Image files select
modules; modules declare the interface they consume and expose, acquire exact
inputs, build inside Dolly, and nominate the files that survive snapshotting.

The authoritative parser and executor is [`src/dollyfile.c`](../src/dollyfile.c).
It is compiled to `/bin/dollyfile` and executes inside the sandbox. JavaScript
does an earlier structural lint for fast feedback and renders the same source
as linked plain text, but it does not build the image.

## Shape

An image is deliberately small:

```text
DOLLY 2
IMAGE pi

USE HOST /modules/default.dm <sha256>
USE HOST /modules/quickjs.dm <sha256>
USE HOST /modules/pi.dm      <sha256>

ENTRY /usr/bin/pi
```

A leaf module can build and expose an object:

```text
DOLLY 2
MODULE example

REQUIRES HEADER libc
REQUIRES TOOL   cc
REQUIRES TOOL   rm

FILE /tmp/example.c
    #include <stdio.h>
    int main(void) { puts("example"); }

SLOP cc \
  /tmp/example.c \
  -o /usr/bin/example

EXPORTS TOOL example

SLOP rm \
  -f \
  /tmp/example.c
```

An aggregate module contains `USE` rows and explicitly re-exports only the
part of its direct children that the next level may consume. The forms do not
overlap: an image contains only `USE` plus one final `ENTRY`; a module is either
a leaf with build steps or an aggregate with child `USE` rows. An aggregate
cannot hide extra `SOURCE`, `FILE`, `FOLDER`, or `SLOP` effects alongside its
composition graph.

## Sequential rules

Every declaration takes effect at its source position.

- `USE HOST /modules/name.dm HASH` fetches that exact module, checks its hash,
  and executes it immediately. One image graph may select a module name or
  locator only once.
- A module's `REQUIRES TYPE name` must be satisfied by an export visible from
  an earlier sibling selected by its parent. That exact object is imported into
  the module and is consequently available to its direct children. Nothing
  else from the provider leaks through. Requirements precede composition or
  build declarations; dependencies are never searched or reordered.
- A leaf `EXPORTS` checks the object now and makes it visible to the parent.
  An aggregate `EXPORTS TYPE name` must re-export an identically named object
  from one of its direct children. It cannot redeclare the path, value, or hash;
  those details are inherited exactly from the child.
- `SOURCE HOST|URL location /destination HASH` downloads, verifies, and writes
  one exact input before continuing.
- `FILE /path` consumes every following line beginning with four spaces. The
  four spaces are stripped. The first other line ends the file body. A
  body-less `FILE` retains an already-created file.
- A trailing `\` joins physical lines into one declaration. Build commands use
  `SLOP [CWD /directory] command ...`; a nonzero status aborts immediately.
- `ENTRY /absolute/program [arguments ...]` selects the image entry point and
  is the image's final declaration.

Whitespace between arguments is insignificant, so columns may be aligned for
readability without changing the parser.

## Types

The current interface object types are:

- `TOOL name [HASH]`: an executable resolved in `/bin` or `/usr/bin`. Bootstrap
  compiler tools carry hashes because they are the externally supplied binary
  seed; source-built tools are authenticated through their pinned recipe and
  source inputs.
- `HEADER name /path`: a header file or header tree.
- `LIB name /path`: one exact static or shared library file.
- `FILE name /path`: an individually named file interface.
- `FOLDER name /path`: a named directory interface.
- `ENV name value` or `ENV name APPEND value`: a persistent environment value.

Names are dependency identities, not a package resolver. The path is evidence
for and storage behind the identity.

## SLOP tool discipline

The executable that starts each `SLOP` row must have appeared in an earlier
`REQUIRES TOOL` or local `EXPORTS TOOL` row. The fast JavaScript lint and the C
Dollyfile builder perform this same small sequential check.

The check exists only while a Dollyfile is building. It does not add variables,
allowlists, or policy to Slop. Normal interactive Slop is completely unchanged.
This is structural recipe validation, not a security boundary.

A tool module also declares the ordinary command set that its execution model
needs. For example, the Make module requires `cp`, while a consumer invoking
Make requires only `make`; this keeps the command dependency attached to the
tool that dispatches it. The small checker deliberately does not parse
Makefiles or constrain interactive Slop, so this remains build-graph
documentation rather than a security policy.

## What survives the build

The build filesystem may contain arbitrary intermediates, but the snapshot
builder never walks it looking for outputs. It serializes only the sorted paths
in `/etc/dolly/image.manifest`.

Retention roots are explicit:

- A leaf `EXPORTS TOOL`, `HEADER`, `LIB`, `FILE`, or `FOLDER` validates the
  exact file or directory that proves that export. `ENV` validates and applies
  a value but retains no file.
- At the image boundary, each direct module export is retained. An aggregate
  therefore controls its complete public closure: a leaf object omitted from
  every aggregate re-export is build-private and does not enter the image.
- `FILE /path` retains that exact non-temporary file. `FILE /tmp/...` is an
  inline or generated build input and is intentionally discarded.
- `FOLDER /path` freezes and retains the regular files below that directory at
  that source position. Files created below it by a later module are not
  silently absorbed.
- Dolly adds the selected recipe, every pinned module recipe, the recipe lock,
  image name, entry record, exported environment record, and the manifest
  itself.

Aggregate re-exports preserve the exact underlying path and the file membership
captured by the producing module; they do not rescan or create a copy. An
aggregate also removes child `ENV` values it did not re-export.
Unexported compiler objects, extracted sources, and other build results
disappear unless a non-temporary `FILE` or `FOLDER` explicitly keeps them.

There can therefore be more retained files than public exports, but never from
implicit discovery. They come from private `FILE`/`FOLDER` declarations, fixed
image-control files, or an explicitly exported directory. A broad directory
root is worth reviewing carefully: for example, exporting `/usr/include` means
every header present when that export is declared is retained. The manifest is the
smallest *declared* closure, which is not automatically the smallest semantic
closure.

Only `ENV` objects exported by direct image modules are serialized. Packaged
boots apply the versioned `/etc/dolly/environment` record after restoring the
filesystem and before loading `DISPLAY` or starting the entry point. A prefix
rebuild reconstructs the same values while replaying its skipped module
declarations, avoiding a double application of `ENV ... APPEND`. Ambient
build-process variables are never serialized.

Mutable session paths such as `/workspace`, `/tmp`, Pi credentials, and Pi
sessions cannot be retained. Every executable module must leave `/tmp` empty
when it returns; this catches temporary objects made indirectly by `make`, the
compiler, or another required tool. Module-owned scratch cleanup is therefore
a checked build invariant rather than a convention. If a recipe fails, the
entire unfinished build state is discarded rather than exposed as an image or
cache layer.

## Module cache

Successful leaf modules with `SLOP` build work emit a content-addressed layer
containing only their declared non-temporary `FILE`/`FOLDER` paths and exact
non-`ENV` exports. Source-only interface modules remain cheap cold steps and do
not duplicate preinstalled seed objects in browser storage. The
layer key binds the module to every earlier completed recipe and to the exact
objects visible through its parent scope. Changing an early dependency or a
parent import therefore invalidates the affected layers, while editing a late
module reuses the expensive prefix. Cache hits restore the layer, then replay
the module parser with execution disabled; requirements, exports, environment,
tool discipline, hashes, and cleanup checks are still validated.

The trusted runtime worker stores these optional layers in a dedicated
IndexedDB database under the runtime build ID. It loads only keys listed for
the selected source graph, verifies each layer hash, and stages opaque bytes in
WasmFS. Wasm code receives no IndexedDB, JavaScript, cookie, local-storage, or
general browser API. A missing, malformed, unreadable, storage-denied, or
quota-limited cache is a normal cold-build fallback. A layer is fully validated
before any of its files are restored. Reads are bounded across all requested
layers, and keys no longer referenced by any packaged image are removed. Module
cache files are removed before the finished image snapshot and live shell start.
A failed overall build does not publish layers completed earlier in that
attempt.

Interactive browsers retain this database for their normal origin. The
headless snapshot builder uses a dedicated worktree-local Chrome profile under
`.cache/snapshot-browser-profile` and a deterministic worktree-local loopback
port, so repeated `npm run snapshot` invocations use the same browser origin
and reuse valid layers instead of starting with empty browser storage. That
profile is a development cache only; it is not copied into snapshots or Pages
artifacts. `DOLLY_BROWSER_PROFILE` and `DOLLY_BROWSER_PORT` can override those
choices.

Before launching Chrome, the snapshot builder also validates an existing
packaged image against the current runtime ID and complete recipe identity,
parses its environment/entry/manifest, and verifies its byte length and SHA-256.
An exact match is already the requested output and is skipped. Set
`DOLLY_FORCE_SNAPSHOT=1` to rebuild even a current image.

There is a second coarse packaged cache:

A rebuild may reuse the longest packaged image whose top-level `USE` rows are
an exact prefix of the requested image. For example, a gamedev rebuild can
restore the `default + quickjs + pi` snapshot and execute only `gamedev.dm`.
The builder still fetches, hashes, parses, and validates every skipped module;
it replays declarations and environment exports but does not rerun their
`SOURCE`, inline `FILE`, or `SLOP` effects.

Cache identity is the runtime build ID plus the ordered module locations and
hashes. The snapshot byte length, SHA-256, root recipe, and retained-path
manifest receive the same checks as a normal packaged image. A missing, stale,
or non-prefix snapshot is a cache miss and falls back to a cold build.

Both mechanisms are build optimizations. They add no Slop behavior, guest
command policy, or network edge. The outputs available after a cache hit remain
exactly the files selected by the source modules' `FILE`, `FOLDER`, and leaf
`EXPORTS` declarations.

Cache paths must not alter output bytes. The synchronous compiler therefore
uses one stable, cleaned scratch namespace instead of embedding an invocation
counter in temporary object names, and LLD merges sections on one thread.
CPython's otherwise time-varying build-info translation unit receives a fixed
date and time. A browser comparison of a complete cold build, the longest
packaged-prefix build, and restoration of all Python-image leaf layers
produces the same snapshot byte-for-byte. Runtime implementation changes rotate
the build ID and therefore the IndexedDB namespace before old layers can load.

Because the conservative key includes the complete earlier recipe prefix,
independent leaves are ordered deliberately: expensive stable foundations such
as native Zig and the Ghostty display build come immediately after their real
prerequisites, while cheaper SDK and utility leaves follow them. The same
boundary applies inside aggregates: `python.dm` runs the expensive
`cpython.dm` leaf before the faster-moving `bonnie.dm` package installer, so a
resolver-only edit restores CPython rather than rebuilding it. This preserves
the simple shared-filesystem correctness model without making an unrelated C++,
Git, or Python recipe edit recompile the terminal stack.

## Exploring `COPY FROM`

There is one concrete use that modules do not solve: build a complete SDK image,
then derive a smaller runtime image containing selected files without rerunning
or retaining the SDK's compiler and sources. That is a real multi-stage build,
not a module dependency.

The candidate syntax is intentionally not accepted yet:

```text
COPY FROM sdk /usr/bin/application       /usr/bin/application
COPY FROM sdk /usr/lib/libapplication.so /usr/lib/libapplication.so
```

For this to be reproducible, `sdk` cannot be an unpinned friendly name. It must
resolve to a source-visible Dollyfile, the same runtime build ID, its complete
recipe chain, and a verified snapshot digest. Directory copies additionally
need a canonical tree digest and the same forbidden-descendant checks as
`FOLDER`. The copied files would be new owned outputs of the receiving image;
the source image's environment, entry point, credentials, sessions, and all
unselected paths would remain absent.

Implementing the spelling before that resolver exists would make `COPY FROM`
less reproducible than `SOURCE` and add a second implicit trust path. The
C++/Python SDK-to-runtime split is the intended proving case. If it needs this
operation, the implementation should first expose packaged snapshots as a
verified, bounded read-only artifact source, then add the small path-copy
directive above. It should not make images recursively execute other images.

For ordinary library composition, `REQUIRES`/`EXPORTS` remains the smaller
mechanism. `SOURCE` remains the operation for an independently pinned external
file.

## Selecting host preparation

`DOLLY_BUILD_IMAGES=default` (or a comma-separated list) limits host source
preparation, static routes, the generated registry, snapshots, and packaged
modules to the selected image graphs. Omitting it builds all source-visible
images. The common runtime compiler seed remains shared because every current
image builds above it.

## Network and identity

All module and source requests cross `env.dolly_http_dispatch`, the same single
browser broker used by programs. A recipe does not grant network authority;
the browser policy still controls destinations, credentials, redirects, size,
quota, and approval.

Snapshot metadata binds the opaque snapshot to the runtime build, image name,
root Dollyfile, full pinned recipe chain, entry arguments, exact retained-path
manifest, byte length, and SHA-256. A stale recipe or runtime therefore cannot
silently restore an older image.
