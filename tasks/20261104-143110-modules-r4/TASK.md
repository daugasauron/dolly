# SOURCE through the build inputs: the engine fetches nothing

- STATUS: OPEN
- PRIORITY: 120
- TAGS: host-modules,audit,dollyfile,seed

From the module audit (`tasks/20261104-135806-module-audit`, R4, section 4 item 1). A seed change:
worth doing when the seed is next rebuilt for another reason, not alone.

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

## Done when

- A build reads every `SOURCE` from the page's verified inputs; `system-build` and the five
  engine-only toolchains (`system-build`, `zig-build`, `zig-llvm-build`, `go-sdk`,
  `ghostty-build`) declare no `http@0`; the catalog builds; a recipe whose `SOURCE` pin is wrong
  still fails naming the row.
