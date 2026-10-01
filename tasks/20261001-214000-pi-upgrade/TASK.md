# Upgrade Pi everywhere

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: pi,demo,upgrade

Owner request (2026-10-01): upgrade the Pi coding agent in every image that
ships it (`pi`, `pi-local`, Slopyard, Studio, game agents).

Today `demos/pi/package.json` pins `@earendil-works/pi-coding-agent` 0.84.4,
built from source in `pi-build.dm` (pi-ai, pi-agent-core, pi-protocol,
pi-client, pi-tui, pi-telemetry), with Dolly patches.

## Done when

- Every Pi-bearing image runs the latest upstream Pi release from pinned
  source, each Dolly patch re-justified or dropped, and the pi, local-llm,
  Slopyard, Studio and game-agent demo tests pass in Chrome.

## Resolution (2026-10-01)

Pi moved from 0.84.4 to 0.99.2, npm `latest` (tag `v0.99.2`, commit
`005af57d…`, published 2026-09-30), in `pi-build`, `pi-runtime`, `pi`,
`pi-local`, `dollyfile-studio`, `slopyard`, `bhop`, `classicube` and
`rts-arena`. Dolly compiles chord, telemetry, ai, agent, codemode, mcp, tui and
coding-agent from the tag with TypeScript 5.9.3 (`noCheck`; upstream builds with
TypeScript 7.0). pi-protocol and pi-client are gone: only upstream's excluded
experimental sources import them now.

Dolly adaptations, re-justified by measurement:

- Kept `pi-quickjs-compat.mjs`: the six `v`-flag TUI regexes are unchanged;
  QuickJS-ng 0.15.0 rejects `terminalSpacingMarkRegex` and silently mismatches
  the other five (`/^\p{Mark}$/v` rejects U+0301); the lowering matches Node on
  a sample set.
- Kept `pi-tsconfig.dolly.json` (emit only, `dist-dolly`); TypeScript 5.9.3
  emits all eight workspaces without errors.
- Kept `dolly-tools.js`; its upstream APIs are unchanged. Edits now keep
  non-UTF-8 bytes (audit-39).
- Runtime packages: added `standardwebhooks`, `@stablelib/base64` and
  `fast-sha256`, which Anthropic SDK 0.124 imports statically; the archive
  scripts find packages Pi's shrinkwrap nests (`openai` below pi-ai). A Node
  module trace of `--version`, `--list-models`, print mode with four tools and
  the TUI loads no other external package.
- Janis: `os.constants.signals` (Pi's bash exit codes), explicit failing
  `zlib.crc32`/`deflateRawSync` (`/bug` zip export) and `createRequire` of a
  file URL string (jiti now loads Babel lazily). A probe importing all 649 Pi
  modules in Dolly fails only on esbuild, AWS, google-auth-library,
  `node:assert` test helpers, the HTML template and the experimental pico3
  harness (`fsyncSync`).
- `local-model-provider.js` reads the prompt and tools from the transcript
  (pi-ai 0.86 `TranscriptContext`).
- Removed the unused `DOLLY_PI_VERSION/URL/SHA256` pins and shipped pi-mcp's
  MCP SDK license notice.

Upstream behavior changes reflected in tests: write reports `Successfully
wrote to`, a nonzero bash exit is an `isError` result, sessions persist at the
first user message, and prompt images are dropped when resizing is on but
Photon is missing (the RTS test's private agent directory now disables it like
the image's `~/.pi/agent`; it also waits for the slow player's tool result
instead of 8 s). The `codemode` tool fails explicitly ("Cannot find package
'quickjs-wasi'"); documented in `demos/pi/README.md`. Each Pi image grew about
17 MB (runtime packages 29.0 → 42.0 MB).

Verification in Chrome: `npm run test:demos -- pi javascript studio bhop
classicube rts` pass; Slopyard controller and driver pass on Xvfb (the driver
failed one camera-steering assertion once and passed on rerun); the local-llm
GPU test passes and `pi -p` answers through the bundled Qwen3.5-0.8B provider;
a Slopyard SDK probe (createAgentSession, custom image tools, `convertToLlm`
override, game compaction through `ctx.modelRegistry.complete`) passes;
`npm run test:source` passes (341).
