# Dollyfile version 3

Dollyfiles are ordered recipes executed by `/bin/dollyfile` inside Wasm.
Modules group useful steps. They can mix commands, files, child modules, and
exports, depend on earlier state, and overwrite existing files. The source
viewer describes this composition; it does not prove that the programs work.

V3 reuses completed images through explicit `FROM` and `COPY FROM` references.
Modules within a stage execute normally. A cached image includes its retained
filesystem, environment, exact exported objects, and recipe provenance.

```text
DOLLY 3
IMAGE example

FROM HOST /Dollyfile-pi <sha256>

FILE /tmp/example.c
    #include <stdio.h>
    int main(void) { puts("hello from an additional tool"); }
SLOP cc /tmp/example.c -o /usr/bin/example
EXPORTS TOOL example

ENTRY /bin/slop
```

This starts with the completed Pi userspace and builds one extra command. The
base's compiler, shell, JavaScript runtime, and agent tools are reused, and the
base's entry program never starts. Replace `<sha256>` with the referenced
recipe's digest. `node scripts/update-module-pins.mjs` refreshes references
through the catalog, including nested modules and image dependencies.

## Operations

| Declaration | Behavior |
| --- | --- |
| `DOLLY 3` | First declaration; selects this language version. |
| `IMAGE name` / `MODULE name` | Recipe identity. |
| `USE HOST /modules/name.dm HASH` | Verify and execute the module here. Repeated uses execute again. |
| `FROM HOST /Dollyfile-name HASH` | Begin an image from a completed artifact; must be the image's first operation. |
| `COPY FROM HOST /Dollyfile-name HASH /source /destination` | Copy a retained file or tree from an independent artifact. |
| `SOURCE HOST /path /destination HASH` | Fetch a pinned release input through the HTTP broker. |
| `SOURCE URL https://… /destination HASH` | Fetch a pinned input through the same broker. |
| `SLOP command…` | Run the command in Slop with failure stopping the recipe. |
| `SLOP CWD /directory command…` | Run the command from the specified directory. |
| `FILE /path` | Retain a file, optionally writing the following indented body first. |
| `FOLDER /path` | Retain the directory and its current members. |
| `EXPORTS TYPE name [details]` | Offer an object when this module finishes. |
| `REQUIRES TYPE name` | Check availability at this point during execution. |
| `ENTRY /program [arguments…]` | Final image declaration; chooses its own entry program. |

`COPY FROM` maps the source itself to the destination. Directories merge;
matching files are replaced and unrelated destination files survive. A missing
source fails. Copying files does not import environment variables or named
exports. Every imported artifact contributes its original source provenance.
The Python+Pi recipe demonstrates copying Python into an independently built
Pi userspace.

Modules share the current filesystem and environment. `REQUIRES TOOL cc`
checks command availability on `PATH`; the command need not have a declared
provider. `REQUIRES ENV NAME` checks the environment. Other named assertions
check an earlier object's path and basic kind. Assertions are optional and can
appear wherever they are useful. A module can use undeclared tools; a command
failure reports the responsible recipe and line.

## Outputs and environment

The browser runs the retained `ENTRY` once. Startup, `.dollyrc`, foreground
ownership and recovery belong to ordinary image scripts, not browser logic.
The catalog uses `/bin/foreground -i /bin/slop /etc/dolly/init.slop`; its startup
modules run `.dollyrc`, launch the selected program and provide a recovery shell.
See [process lifecycle](process-model.md#cancellation).

`EXPORTS TOOL name` resolves a command on `PATH`; it takes no path. The builder
retains the resolved file when the module finishes. An optional hash asserts its
bytes. `FILE`, `LIB`, `FOLDER`, and `HEADER` exports require a name and an absolute
path, including when exporting a child's outputs. `FILE` and `LIB` must be files,
`FOLDER` a directory, and `HEADER` may be either. These are small runtime checks,
not compatibility certificates.

```text
EXPORTS LIB example /usr/lib/libexample.a
EXPORTS HEADER example /usr/include/example
EXPORTS FOLDER python-stdlib /usr/lib/python3.14
EXPORTS ENV EXAMPLE_HOME /usr/share/example
EXPORTS ENV PATH APPEND /opt/example/bin
```

Declarations may precede creation of their outputs: members are captured when
the module finishes. A directory export includes the files present at that point,
including additions made after a child finishes. Repeated exports replace the
previous named object. An image retains its direct modules' exports; a module
selects which outputs to offer in turn. Explicit `FILE` and `FOLDER` retention
also survives composition.

Environment assignments take effect immediately and persist through subsequent
steps. `EXPORTS ENV NAME` keeps the current value; `APPEND` joins with a colon.
The final environment values are stored in the image; loading a base does not
replay assignments or append them twice.
Recipe values are literal; shell expansion happens inside `SLOP`.

Unretained intermediate files disappear when the finished image boots. Temporary
files do not need explicit cleanup to make a module valid. Cleaning large build
trees can still reduce peak memory. Deleting an earlier retained file removes it
from the final image. Mutable workspace files, agent credentials, and session
history cannot be packaged as image outputs.

## Text and inspection

Recipe words support quotes and escapes. Comments begin with `#` at the start
of a word, outside quotes. Comments are removed before interpreting a trailing
backslash as a continuation. `SLOP` preserves the command's original quoting
when passing it to the shell.

A `FILE` body consists of consecutive lines starting with four spaces. Exactly
those four spaces are removed; a blank content line needs four spaces too.
The first line without that indentation ends the body. Body text is literal,
including comments and backslashes.

The linked plaintext viewer keeps modules, runtime assertions, inputs, and
artifact references clickable. A missing inferred provider is not a lint
error. Syntax, source hashes, recursive inclusion cycles, ABI admission, and
browser authority remain checked.

## Build reuse

The browser looks for a verified local artifact, then a matching published
artifact. A missing dependency is built in a disposable Wasm instance before
its consumer. Builds run sequentially, and each completed artifact is saved
before later stages run. Each worker uses the same explicit HTTP policy.

Cache identity includes the runtime build ID, the root recipe hash, and the
actual snapshot digests of its direct image inputs. A dependency rebuilt into
different bytes invalidates its consumers even if its recipe did not change.
V3 does not cache individual modules by their declared outputs: arbitrary
reads, overwrites, and deletions make that
insufficient. Explicit rebuild reruns the selected stage while reusing its
referenced image artifacts. Unpinned network access inside arbitrary commands
is not made reproducible by the cache; change a recipe pin or rebuild the
relevant artifact when refreshing such inputs.

All five existing images remain source recipes: `default`, `pi`, `python`,
`python-pi`, and `gamedev`. There is no required catalog-wide dependency solver
or additional module interface language.

For image iteration, run `npm run image -- IMAGE`. It prepares the selected
image's local source inputs, refreshes their `SOURCE HOST` hashes and recipe
references, then builds using the existing Wasm runtime. Upstream downloads
still require their independent pins; `SOURCE URL` hashes are never refreshed
automatically. Add `--package` to create a verified local preview release for
`npm run serve`. Rebuild the runtime separately when changing the kernel,
bootstrap seed, or Dollyfile executor.

Published images share compressed packs of identical filesystem records. Each
image lists the packs it needs; the browser reconstructs and verifies the exact
snapshot before restoring it. File identity includes path, kind, and contents,
so overwrites and symlinks remain distinct. Pack URLs are content-addressed and
can be reused across images. This reduces distribution duplication without
adding layer-mount behavior to the Wasm filesystem.
