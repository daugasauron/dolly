# Publish state lags main

- STATUS: OPEN
- PRIORITY: 120
- TAGS: build

Local main is 143 commits ahead of `origin/main` (`e3ba5fb`, 2026-09-25). Both live sites serve
`7ffd9c9`, still carrying images main deleted (external-source, gamedev, gamedev-phone,
python-pi) and no Slopyard.

## Evidence

Established: CONFIRMED BY READING. `git rev-list --count origin/main..main` = 143 on 2026-09-30.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Owner decides when to push and redeploy after the cleanup.

## Done when

- Push/deploy performed by the owner or explicitly deferred.

## Status (2026-10-01, 15:47)

The local checkpoint `checkpoint-2026-10-01-pm` (release `35b11b69…`, 41
images) is served on localhost:9000. `main` is still at
`checkpoint-2026-10-01` (`0c3cb7e`, equal to `origin/main`), 72 commits behind
the afternoon checkpoint; pushing and redeploying daugasauron.com and GitHub
Pages remains the owner's call.
