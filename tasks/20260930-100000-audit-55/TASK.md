# Deployment path is manual, duplicated and partly undocumented

- STATUS: OPEN
- PRIORITY: 120
- TAGS: build,doc

Two exporters each write the whole ~10 GB export; a tarball is always created though the domain
deploy discards it; the site is hashed about five times; `package-pages.sh` duplicates its file
lists (`:34-99`, `:120-216`) and they have drifted. `gh release upload` and the workflow
dispatch are undocumented; post-deploy verifiers were untracked in `build/deployments/`.
`docs/deployment.md:16-17,63,107` references `build/releases/current` while packaging writes
`{domain,github}-releases`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One documented publish path with one file list.

## Done when

- Deployment doc matches the scripts; duplicate lists merged.
