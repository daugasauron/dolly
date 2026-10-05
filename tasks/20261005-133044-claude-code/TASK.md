# Run Claude Code inside a Dolly image

- STATUS: OPEN
- PRIORITY: 255
- TAGS: javascript,janis,agent,demo

Owner (2026-10-05): "add a parallel task to try to make claude work inside the
image, would need to extend janis I guess, or maybe just try to compile
node/npm completely?"

## Facts (npm, 2026-10-05)

- `@anthropic-ai/claude-code` 2.1.289 is a 187 KB wrapper (`bin/claude.exe`)
  around per-platform native executables (`-linux-x64`, `-darwin-arm64`, …).
  There is no JavaScript to run and no wasm platform, so neither Janis nor a
  complete Node port can run the current release.
- Releases up to at least 2.1.100 ship a bundled `cli.js` (49 MB unpacked,
  `engines.node >= 18`); 2.1.200 no longer does. The last `cli.js` release is
  the candidate.
- `@anthropic-ai/claude-agent-sdk` 0.3.289 follows the same native layout.

## Constraints

- Claude Code is proprietary (Anthropic's Commercial Terms). Dolly's images
  and sites must not redistribute it: a user installs it from the npm registry
  inside their own session. Its native executables are not unpacked or modified.
- Authentication is the user's own API key or an Anthropic-compatible endpoint
  (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`). Dolly builds no claude.ai
  sign-in path and no relay, and this machine's Claude Code login is never used.
- No Claude-specific code in the core or in Janis: every gap found is a general
  Node-compatibility fix (`20261005-132750-janis-node-gaps`) or an explicit
  unsupported result.

## Work

1. Find the last release with `cli.js`; list what it needs from Node (module
   system, `child_process`, TTY raw mode, `fetch`/streams, `WebAssembly`,
   workers, native add-ons, the vendored ripgrep) and what Janis lacks.
2. Time-boxed: what a complete Node port (V8 and libuv on Dolly's wasm64
   process ABI) would take, with evidence, and a recommendation.
3. Run it under Janis as far as it goes: start, render, one tool-using turn.

## Done when

- The findings and the recommendation are recorded here, or Claude Code
  completes a tool-using turn inside a Dolly session in a real browser.
