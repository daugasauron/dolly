# Propose Dollyfile v5 after the syntax audit

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dollyfile,core

The owner asked for a Dollyfile syntax audit and a v5 proposal. v4 differs from v3 only by
`REQUIRES HOST name@abi`; all 120 recipes use v4. Known pressure points: pins rewritten into
tracked files on every build, whole-image invalidation from the seed, verbose repeated `COPY
FROM HOST` rows, two parsers.

## Evidence

Established: Owner request. See `20260930-090100-owner-direction`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

A written v5 proposal with rationale, migration and what it removes.

## Done when

- Proposal recorded in this task with examples; owner decides whether to implement.

## Resolution (2026-09-30)

Proposal written and rejected by the owner; see 20260930-200000-dollyfile-v5 and 20260930-223000-dollyfile-design.
