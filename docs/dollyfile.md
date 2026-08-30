# Dollyfile proposal

A Dollyfile is a small, reviewable recipe for turning pinned source inputs into
a verified Dolly system capsule. It is inspired by Dockerfile's useful part—a
linear build description—but deliberately rejects assumptions that do not fit
Dolly: Linux base images, a privileged daemon, host bind mounts, users and
permissions, arbitrary host shell steps, ambient build networking, and secrets
inside image layers.

The format should solve a concrete problem already visible in the POC. Today a
new package may require edits in CMake preload flags, preparation scripts,
`startup.slop`, `startup.mk`, the snapshot C manifest, documentation, and tests.
One recipe should instead define source materialization, target-side build
steps, retained outputs, checks, and entry behavior.

## Design principles

1. **Compilation happens inside Dolly.** The trusted build tool may download,
   verify, unpack, copy, and patch source inputs. It does not compile the target
   executable.
2. **Inputs are immutable and pinned.** A remote archive requires SHA-256; a Git
   source requires an exact commit. Floating tags and branches are rejected.
3. **No ambient build network.** Version 0 `RUN` steps cannot call HTTP. Every
   source needed by the build is materialized before the Wasm build begins.
4. **The recipe cannot grant runtime authority.** It may declare a named network
   need, but only the embedding page's HTTP policy can grant destinations and
   credentials.
5. **One recipe, one snapshot manifest.** Retained paths are generated from
   `KEEP` directives rather than duplicated in C source.
6. **Unknown means error.** Unknown directives, missing pins, absent retained
   files, and unsupported shell behavior fail the build.
7. **Text is canonical.** The source file and lock file are line-oriented text.
   JSON is not needed for the contract; generated JavaScript is acceptable only
   where the browser build already requires it.

## Proposed version-0 syntax

```text
# comments occupy a line or begin after whitespace
DOLLY 0

SOURCE ARCHIVE <url> SHA256 <64-hex> INTO <absolute-path> [STRIP <count>]
SOURCE GIT <url> COMMIT <40-hex> INTO <absolute-path>
COPY <project-path> <absolute-path>
PATCH <project-path> IN <absolute-source-directory> [STRIP <count>]

ENV <name>=<value>
WORKDIR <absolute-path>
RUN <slop command>
CHECK <slop command>

KEEP <absolute-file>
KEEP-TREE <absolute-directory>
ENTRY <absolute-executable>
DECLARE HTTP <policy-label>
```

Rules:

- `DOLLY 0` must be the first non-comment line and selects a recipe grammar plus
  compatible seed runtime. It is not a mutable Linux `FROM` image.
- Materialization directives (`SOURCE`, `COPY`, and `PATCH`) must precede the
  first `RUN`. This gives the build an explicit offline transition.
- Project paths are relative to the Dollyfile directory, cannot traverse above
  it, and become immutable build inputs.
- Guest paths are absolute. Dolly has no permission or ownership directives.
- `ENV` and `WORKDIR` affect subsequent `RUN` and `CHECK` commands in source
  order.
- The remainder of a `RUN` or `CHECK` line is Slop source, with Slop's quoting
  and expansion rules. The Dollyfile parser performs no second variable
  language.
- Every `RUN` executes as `/bin/slop -e -c ...` in the one Wasm build machine.
  The generated startup script begins with `set -ex` and prints a distinct
  section heading before each step.
- `CHECK` runs after all `RUN` steps and before sealing. It must not mutate a
  retained artifact; a later version could enforce this by comparing manifests.
- `KEEP` names one file. `KEEP-TREE` recursively retains one directory. Missing
  paths fail sealing. `/workspace`, `/tmp`, and known credential/session paths
  are rejected even if named.
- There is exactly one `ENTRY`. Version 0 normally uses `/bin/slop`.
- `DECLARE HTTP label` is metadata only. It never contains a secret and never
  changes `DOLLY_HTTP_POLICY`. A browser embedding may choose to satisfy the
  label with separately reviewed policy or refuse to launch the capsule.

Version 0 intentionally has no `FROM`, `USER`, `CHMOD`, `EXPOSE`, `VOLUME`,
`MOUNT`, `ADD`, `RUN-HOST`, `SECRET`, shell selection, background job, or
arbitrary plugin directive.

## Example

```Dockerfile
DOLLY 0

SOURCE ARCHIVE https://ftp.gnu.org/gnu/make/make-4.4.1.tar.gz \
  SHA256 dd16fb1d67bfab79a72f5e8390735c49e3e8e70b4945a15ab1f81ddb78658fb3 \
  INTO /usr/src/make STRIP 1
COPY config/make-dolly.patch /usr/src/dolly-inputs/make.patch
PATCH config/make-dolly.patch IN /usr/src/make STRIP 1
COPY src/startup.mk /usr/src/dolly/startup.mk

ENV CC=cc
ENV SHELL=/bin/slop
WORKDIR /usr/src/make
RUN make -f /usr/src/dolly/startup.mk make

CHECK /usr/bin/make --version
CHECK /usr/bin/make -f /usr/share/dolly/checks/make.mk

KEEP /usr/bin/make
KEEP /usr/share/licenses/make/COPYING
ENTRY /bin/slop
```

The backslashes above are Dollyfile line continuations, not shell
continuations. A real current-system recipe would have one section per package
and retain the complete `/bin`, `/usr/bin`, libraries, Git helpers, display
module, and base configuration.

## Build pipeline

```text
Dollyfile + project files
          │
          ▼
trusted recipe compiler
  parse → validate → fetch pinned inputs → verify → unpack/copy/patch
          │
          ├─ dolly.lock                 human-readable provenance
          ├─ initial WasmFS data        sources, headers, startup recipe
          ├─ /etc/dolly/startup.slop    generated target-side build
          └─ /etc/dolly/image.manifest  generated retained paths
                         │
                         ▼
                headless browser /rebuild
                  RUN + CHECK inside Wasm
                         │
                         ▼
                snapshot exactly KEEP paths
                         │
                         ▼
              digest-checked static capsule
```

The current `system_files[]` array should become a parser for the generated
`/etc/dolly/image.manifest`. Snapshot capture still uses an allowlist and never
walks the whole filesystem. The manifest itself belongs to the trusted build
input and should be included in the snapshot metadata.

The special snapshot export endpoint remains build-harness-only. A normal
served Dolly page has no host-write route.

## Lock file

A generated `dolly.lock` can remain simple text:

```text
dolly-lock 0
recipe-sha256 9a…
seed-build 31…
abi dolly-0 77…
source archive make 4.4.1 dd16… https://ftp.gnu.org/gnu/make/make-4.4.1.tar.gz
source git git e901… https://github.com/git/git.git
keep file /usr/bin/make
entry /bin/slop
declare-http model-provider
```

Canonical spacing, sorted resolved source records, and exact digests make the
lock file diffable. It is build metadata, not a runtime ABI and not an authority
grant.

## Relationship to layers and caching

The first implementation should produce one capsule and no Docker-like layer
filesystem. Layers introduce ordering, whiteouts, cache invalidation, and
cross-ABI reuse before Dolly has defined its stable substrate.

Later, a recipe prefix can be cached by a key containing:

- seed runtime build ID;
- command ABI digest;
- normalized recipe prefix digest;
- all materialized input digests;
- build-tool version.

An intermediate cache remains an opaque Dolly snapshot, never a host directory
tree. A cache hit must still run final checks and cannot widen browser policy.

## Security consequences

A Dollyfile improves security review because it separates four kinds of action:

1. trusted, pinned source acquisition;
2. deterministic source materialization;
3. untrusted build execution inside the Wasm sandbox;
4. separately configured runtime network authority.

Dockerfiles often blur these through `RUN curl ...`, build secrets, mounts, and
a daemon with host access. Dolly should make those transitions impossible or
visibly explicit. A malicious compiler may corrupt every output and the entire
build sandbox, but it still cannot read a host directory, run a host process, or
send data unless the build embedding granted an HTTP policy. The sealed result
is accepted only if its recipe, sources, ABI, retained paths, and checks match
the trusted build plan.

## Minimal implementation sequence

1. Write a strict parser and normalizer in JavaScript build tooling; keep the
   grammar dependency-free.
2. Generate the current `startup.slop` and a text image manifest without yet
   deleting the handwritten versions; compare them in tests.
3. Teach `system-snapshot.c` to consume the generated manifest with exact path,
   count, size, duplicate, and forbidden-prefix validation.
4. Convert one small package, then zlib/Make, then the full current userspace.
5. Add source-lock and capsule-digest checks.
6. Remove the duplicated CMake/startup/snapshot lists only after the browser
   proof is identical.

That sequence gives Dolly a useful build API quickly while preserving the
current working proof as an oracle.
