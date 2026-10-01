# Dollyfile v6: a consistent language from first principles

- STATUS: OPEN
- PRIORITY: 350
- TAGS: dollyfile,design,core

Owner direction (2026-10-01): getting the core architecture and Dollyfile
abstractions right is the project's first goal; everything else demonstrates
them. The owner likes how DOLLY 5 works but finds it slightly inconsistent and
wants a cleaner v6, rethought from first principles, with no workarounds.

Inputs: `docs/dollyfile.md`, `src/dollyfile.c`, the graph/pin/lint tools,
`20260930-223000-dollyfile-design` (design as executed and its gaps), the
`COMPILEC` bootstrap work (`20261001-123500-bootstrap-boundary`), and image
roles: the owner finds it odd that `javascript`, `python` and `ripgrep` are
listed as applications; they read as build images.

## Done when

- A v6 specification with the reasoning for each construct, implemented in the
  engine and tools, every recipe migrated, docs rewritten, and the catalog
  rebuilt with all suites passing.
