# Reduce Dolly to a clean core: modular runtime plus minimal POSIX userspace

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,cleanup,boundary,build

Owner direction (2026-09-30): the product is the modular runtime and the minimal POSIX
userspace. Everything else (Pi, Python, Neovim, Codex/Rust, local LLM, Studio, games) is a demo.
Games stay in this repository for now. The core must be small, clean and reconciled with its
documentation.

## Evidence

Established: Owner request. Covers the audit tasks filed on 2026-09-30
(`20260930-100000-audit-*`).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

A reader can tell core from demos by layout; core files contain no demo-specific code; docs
describe the code as it is.

## Done when

- Core/demo boundary is explicit in the tree and the image catalog; demo code no longer leaks
  into core files (harness, core tests, kernel, host modules).
- Build and run authority are separated: a running image cannot start builds or write the image
  cache unless it explicitly requires a build capability.
- There is exactly one rebuild screen for every image (the terminal page's bootstrap log),
  showing live build output including compiler warnings; the separate build-only page is gone.
- The Dollyfile syntax is audited, its parser disagreements and doc drift fixed, and a v5
  proposal is recorded.
- All audit tasks are fixed or explicitly deferred with a reason; the whole catalog is rebuilt
  and verified in real browsers; a local server runs the result.
