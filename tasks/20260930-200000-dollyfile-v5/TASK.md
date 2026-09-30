# Dollyfile v5: pins in one lock, output-pinned leaf builds, fewer rules

- STATUS: OPEN
- PRIORITY: 150
- TAGS: dollyfile,design

Proposal only; the owner decides whether to implement it. It follows the v4
syntax audit on `fix/dollyfile` (parsers now agree on a shared corpus, one JS
graph walker, v3 removed) and answers `20260930-100000-audit-50`; it would also
close `audit-54` (pin rewrites) and most of `audit-51` (whole-catalog rebuilds).

## Measured problems in v4

- **Pins live in recipe text.** 120 recipes hold 487 SHA-256 pins. 80 of the
  last 100 commits that touch recipes change only pins; half of all added recipe
  lines carry one. `npm run image` rewrites them twice
  (`scripts/build-image.mjs:42`, `prepare-image-sources.sh:639`). A leaf edit
  cascades: its hash changes its parent's text, whose hash changes the next
  parent, up to every image (41 files for one `core-tools.dm` edit). Parallel
  worktrees conflict on these lines.
- **Cache identity cascades too.** An image's key is its recipe hash plus the
  whole-snapshot digests of its FROM/COPY inputs. Any seed edit invalidates all
  40 images (~2 h); `codex-build` (70 min) rebuilds whenever anything under
  `rust-build → rust-sdk → system-build` changes, although `codex` copies only
  three paths out of it.
- **Repetition.** 201 USE/FROM/COPY rows repeat the constant word `HOST`; 57 of
  74 `COPY FROM HOST` rows repeat a pin already written in the same file, and 72
  of 74 copy a path to the same path.
- **Rules without meaning.** `REQUIRES HOST` may appear anywhere in images and
  modules (11 module rows), though it describes the finished image. `FILE` means
  three things: write and retain, retain an existing file, or write scratch under
  `/tmp/` that is never retained. A blank body line needs four trailing spaces,
  which editors strip. `EXPORTS ENV NAME APPEND` sets the value `APPEND`. Quotes
  may span a continuation, but comments are found per physical line.
- **Two parsers.** C (`src/dollyfile.c`) and JS (`src/dollyfile-view.mjs`) are
  kept equal only by `test/fixtures/dollyfile-syntax.mjs`.

`modules/sbase-tools-{1..12}.dm` (424 lines) differ only in their tool lists.
That needs no language feature: one module with one Makefile (`audit-36`).

## Proposal

1. **One lock file for derived pins.** Recipes name references without hashes;
   a generated, sorted `dolly.lock` holds one line per recipe and staged input:

   ```text
   DOLLY-LOCK 1
   recipe /Dollyfile-system 74c0…
   recipe /modules/git.dm 549e…
   source /static/default/sbase.tar a282…
   ```

   Only `SOURCE URL` keeps an inline pin: it is upstream content, never
   refreshed automatically. A leaf edit changes exactly one lock line. The
   executor already writes the same shape to `/etc/dolly/recipes.lock`; in v5
   the builder receives the root's lock subset and verifies every fetch against
   it, and the artifact records it. An image's identity is the hash of its lock
   subset (a Merkle closure computed by the graph walker), not text in its
   parents. Custom recipes resolve against the site's published lock, which the
   result records. `npm run image` updates only `dolly.lock`.

2. **Output-pinned leaf builds.** A lock line may pin a builder image's output
   instead of rebuilding it from current inputs:

   ```text
   output /Dollyfile-codex-build 9c0e… process-abi=5d2a…
   ```

   `COPY` from that image then restores the pinned, content-addressed artifact
   from the local cache or the published packs. Only an explicit
   `npm run image -- codex-build --refresh` rebuilds it and rewrites the line.
   COPY imports files, not environment or host requirements, so the artifact
   stays valid while the process ABI it records matches; programs are checked
   again at load. This needs the image loader to accept an input built under
   another seed build ID when its recorded process ABI matches. `FROM` keeps
   input-based identity. Independently, key COPY consumers by the digest of the
   copied records instead of the whole input snapshot, so identical outputs
   stop a rebuild cascade.

3. **Smaller syntax.** Drop the constant `HOST`, write `COPY` without `FROM`,
   and let one COPY row copy several paths to the same paths:

   ```text
   DOLLY 5
   IMAGE system
   REQUIRES HOST display@0 http@0 download@0 upload@0 snapshot@0
   FROM /Dollyfile-system-tools
   COPY /Dollyfile-ripgrep /usr/bin/rg /usr/share/licenses/ripgrep
   COPY /Dollyfile-codex-build /usr/bin/codex TO /usr/libexec/codex
   USE /modules/session-recovery.dm
   SOURCE /static/default/sbase.tar /tmp/sbase.tar
   SOURCE https://example.org/x.tar /tmp/x.tar 0f3a…
   ENTRY /bin/foreground -i /bin/slop
   ```

4. **Placement with meaning.** An image header is `DOLLY 5`, `IMAGE name`,
   optional `REQUIRES HOST` lines, then optional `FROM`; modules may not declare
   host requirements (their five users move them to their images). `ENTRY`
   stays last.

5. **Unambiguous text.** `WRITE /path` plus body writes a file; `KEEP /path`
   retains a file or directory (replacing bare `FILE` and `FOLDER`). A body ends
   at the first non-empty line without four spaces; empty lines inside it are
   kept and trailing empty lines dropped, so editors cannot truncate it.
   `EXPORTS ENV NAME APPEND` requires a value. A quote left open at the end of a
   physical line is an error.

6. **Optionally one parser.** `/bin/dollyfile --inspect` could print the parsed
   graph as JSON for Studio (in the image) and Node tooling (a native build, as
   the tests already compile). That removes `dollyfile-view.mjs` and the
   agreement corpus but makes catalog tooling need a C compiler. Decide
   separately.

## Migration

A one-off script converts all 120 recipes in one commit: move derived pins to
`dolly.lock`, drop `HOST`, merge COPY rows from one image, move `REQUIRES HOST`
to image headers, and convert `FILE`/`FOLDER` to `WRITE`/`KEEP`. Both parsers,
the shared corpus, `update-module-pins.mjs` (replaced by lock generation), the
Studio examples, skill and prompts change together. v4 support is removed in the
same commit; the seed change already invalidates cached custom images and
sessions.

## Removes

`update-module-pins.mjs` text rewriting, pin cascades in diffs and merges, most
of the full-catalog rebuilds after seed edits, 201 `HOST` tokens, 57 repeated
COPY pins, and the three meanings of `FILE`.

## Done when

- The owner accepts, changes or rejects each numbered part.
- If accepted: converted recipes build `system-build` and `default`; an edit to
  one module changes one lock line; a seed edit leaves `codex-build` cached; both
  parsers pass the converted corpus.
