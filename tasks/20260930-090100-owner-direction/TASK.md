# Reduce Dolly to a clean core: modular runtime plus minimal POSIX userspace

- STATUS: CLOSED
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

## Status (2026-10-01)

- Core/demo boundary: done. Demos own their recipes, tests and docs under
  `demos/`; the old harness is gone; the core artifact test names no demo
  (`630c407`); remaining leaks are the site packaging lists
  (`20260930-100000-audit-63`).
- Build and run authority: done (`build@0`, `dc719d0`).
- One rebuild screen: done (terminal page bootstrap log; the build-only page is
  gone).
- Dollyfile audit: v5 proposal recorded and rejected by the owner
  (`20260930-200000-dollyfile-v5`); the design as executed is in
  `20260930-223000-dollyfile-design`; the HOST keyword goes next
  (`20260930-230823-full-urls`).
- Audit tasks: 16 closed on 2026-10-01 with evidence; the rest are open with
  current priorities. Catalog rebuilt and verified 2026-10-01 (39 of 40 images;
  zero-ad waits for `20260930-231200-self-host-zero-ad`).

## 2026-10-01 afternoon

- Local checkpoint `checkpoint-2026-10-01-pm` (release `35b11b69…`, all 41
  images, Codex fixed, display for every image, zero-ad relinked) is served on
  localhost:9000.
- On `next`, toward a smaller core: Slop leaves the seed (`COMPILEC`, seed now
  compiles only the Dollyfile engine), module packets leave `process.h`
  (per-module digests), the terminal mailbox leaves display@0, the frontend is
  plain static files at repository paths, Bonnie is replaced by stock pip, and
  demo names left `generate-routes.mjs`. `next` needs a full catalog rebuild
  before its release.

## Closed (2026-10-01)

The core/demo split, host modules and minimal-core goals shipped in the release
candidate; what remains of the direction is tracked by
`20261001-214000-core-polish` (no workarounds in the core) and
`20261001-214000-dollyfile-v6` (the language).
