# SOURCE through the build inputs: the engine fetches nothing

- STATUS: OPEN
- PRIORITY: 220
- TAGS: host-modules,audit,dollyfile,seed

From the module audit (`tasks/20261104-135806-module-audit`, R4, section 4 item 1). A seed change:
worth doing when the seed is next rebuilt for another reason, not alone.

## State (2026-11-17, ws/modules)

Done on `ws/modules`; the catalog build is the 0.1.8 round's (the seed changed).
- The engine (`programs/dollyfile.c`) links no HTTP client and fetches nothing: a site-path
  locator's text is `/etc/dolly/recipe.Dollyfile`, which the build Worker writes from the
  recipe it checked against its pin, and a `SOURCE` row's file is
  `/etc/dolly/sources/SHA256`, a build input the Worker hands it (`site/build-worker.mjs`);
  the engine checks the digest as before and fails at the row
  (`LOCATOR:LINE: SOURCE failed`) when it differs or when no file came.
- The Worker reads a site path's file from the image directory by the size the catalog gives
  it (`staticSources`, parts reassembled and checked), and an external URL's through the page:
  `network-fetch` (`page/network.mjs` `fetch`, answered by `serveNetworkFetches` on the
  route's page and in `site/image-builder.mjs`), admitted, counted and shown by the page's
  HTTP policy, without credentials, within the rule's size and time, through an embedding's
  relay where one is set (dolly-build).
- The broker's "trusted bootstrap sources" exception is gone (`page/http-policy.mjs`,
  `broker.mjs`'s reassembly of their parts, `bootstrapSources`): nothing of the site passes
  the broker for a build, and a program's request for a site file is judged like any URL.
  `test/boundary-browser.mjs` checks a build's `SOURCE` of a file the directory stores in
  parts instead: both parts read and checked, a program reaching none, a corrupt part failing
  the build at its row.
- `system-build`, `dollyfile`, `amy`, `zig-build`, `zig-llvm-build`, `go-sdk` and
  `ghostty-build` declare no `http@0`. `buildHost` keeps `http@0` for the steps (owner,
  2026-11-12: a step may fetch, `SLOP pip install`).

Verified in this tree: the runtime and the core's 42 images rebuilt on the changed seed, every
`SOURCE` row of them read from the build inputs (`system-build`'s 40, `system-tools`'
119), and `system-build`, `dollyfile`, `amy`, `zig-build` and `ghostty-build` sealed
without `http@0` (the seal refuses a retained executable stamped with an undeclared module).
`test/default-browser.mjs` "composed with sources", new, passes in Chromium and Firefox: a
custom recipe's `SOURCE` of the test server's URL is handed over and checked; under a policy
without a rule for it the build fails at that row, the page's refusal in its log; and a site
path's `SOURCE` with a wrong pin fails naming the row (`...:5: SOURCE failed`).
`test/fixtures/dollyfile-cases.mjs` (`image-browser.mjs`), which runs the engine in a
session, puts its `SOURCE` files where the page would. With the trusted sources gone (the
core's 43 images rebuilt again, image inputs `f3edb8bb…`), `test/boundary-browser.mjs` passes
in both browsers: a build's `SOURCE` of a file stored in two parts reads both, checks the
pin, and fails at its row when a part is corrupt, while a program's `curl` of the file, of a
part, or of another version's path is refused before Fetch (no part is requested again); so do
`http-refusals-browser.mjs`, `network-browser.mjs`, `host-compute-browser.mjs` and
`image-browser.mjs` (logs `work/modules/build/modules-tests/c/`, `d/`, `e/`). Left for the
0.1.8 round, which rebuilds every image (the seed changed): the catalog builds,
`zig-llvm-build` and `go-sdk` among it.

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
