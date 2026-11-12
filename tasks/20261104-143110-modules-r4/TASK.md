# SOURCE through the build inputs: the engine fetches nothing

- STATUS: OPEN
- PRIORITY: 220
- TAGS: host-modules,audit,dollyfile,seed

From the module audit (`tasks/20261104-135806-module-audit`, R4, section 4 item 1). A seed change:
worth doing when the seed is next rebuilt for another reason, not alone.

## State (2026-11-12)

Narrowed. Owner (2026-11-11): "it should be possible to do SLOP pip install x y z in a Dollyfile to
build something"; (2026-11-12) "Security during build isn't important". So a build keeps its network
edge: `buildHost` keeps `http@0` for the steps. What stays is the engine's own part: `SOURCE` rows
come through the verified build inputs, and `/bin/dollyfile` links no HTTP client, so the engine
depends on no module but `runtime@0` (`tasks/20261112-074501-modules-modular`). The done-when's
"declare no `http@0`" holds for the engine-only toolchains, not for builds whose steps fetch.

Every base holds `/bin/dollyfile`, which links the HTTP client for one operation: `SOURCE` rows,
fetched through the broker (`src/dollyfile.c` `fetch_source`; `scripts/build.sh` links the seed's
programs with every client). So every toolchain declares `http@0`, and `buildHost`
(`host/modules.mjs`) gives builds the network edge. FROM, INSTALL and COPY inputs already reach the
engine as files the page verified (`host/runtime/runtime.mjs`, `env.dolly_build_input_read`), and
`src/image-build.mjs` already parses `graph.root.sources`.

- The build Worker stages each `SOURCE` row as a verified build input; `fetch_source` reads the
  staged input instead of the broker.
- The engine links no HTTP client; `system-build` declares `runtime@0` alone; `buildHost` loses
  `http@0`, so a build has no network edge at all.
- `amy` (which installs the `dollyfile` package) keeps `http@0` for its own fetches until R5.

Cost: `src/dollyfile.c`, the build Worker, `host/modules.mjs`, `docs/dollyfile.md` (`SOURCE`
"downloads through the HTTP broker"); the seed is rebuilt, so every image is.

Found (2026-11-12): the catalog's SOURCE rows are all site paths, which the catalog lists with
size and digest (`staticSources`), so the build Worker can fetch them and hand them over as
build inputs (`/etc/dolly/sources/SHA256`), and the recipe's text beside them. But a SOURCE row
may be an external URL: `dolly-build init`'s template documents `SOURCE https://unpkg.com/…`,
which goes through the broker under the page's HTTP policy today. Without the engine's client the
Worker fetches those, under the same policy, which is http@0's page side: it needs the page's
policy as a resource every provider and the build Worker receive, as R5 does
(`20261104-143110-modules-r5`). Do the two together, in the next full round; the broker's
"trusted bootstrap sources" exception (`host/http/policy.mjs`, `broker.mjs`, `bootstrapSources`)
then goes, since nothing of the site passes the broker any more.

## Done when

- A build reads every `SOURCE` from the page's verified inputs; `system-build` and the five
  engine-only toolchains (`system-build`, `zig-build`, `zig-llvm-build`, `go-sdk`,
  `ghostty-build`) declare no `http@0`; the catalog builds; a recipe whose `SOURCE` pin is wrong
  still fails naming the row.
