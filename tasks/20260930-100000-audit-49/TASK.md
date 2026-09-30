# Dollyfile documentation and tooling drift

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: dollyfile,doc

`docs/dollyfile.md:43-44` says custom images cannot be saved as sessions, but
`src/browser.mjs:204` saves them; `:230` says V3 in a v4 document. `DOLLY 3` appears only in
test fixtures. `sourceLink` in `src/dollyfile-view.mjs:297-303` is unused. `npm run
lint:dollyfiles` is not run by any test, CI job or doc.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

The spec describes the implemented language; lint runs in the source test suite.

## Done when

- Docs corrected; lint wired into `npm run test:source`; dead helpers removed.

## Result (2026-10-01)

`docs/dollyfile.md` matches the executor, the "V3" wording, `DOLLY 3` and
`sourceLink` are gone (`6366feb`, `76a941a`), and the lint runs in
`npm run test:source` ("every catalog recipe graph lints").
