# Remove v0.1.6 from the site (waits for the owner)

- STATUS: OPEN
- PRIORITY: 60
- TAGS: site,0.1.8

## State (2026-11-16, the audit): waits for the owner

One fact for the decision, measured 2026-11-16: `https://slopshare.dev/v0.1.6/`'s menu links to
`./agents/`, which answers 404, since the deployment kept the menu's link and dropped the showcase
(`tasks/20261116-140230-repo-06`). A published version never changes, so the broken link stays as
long as v0.1.6 does. If it stays, its GitHub release needs one line more. Unlike v0.1.4's, v0.1.5's
and v0.1.7's notes, they name no SHA-256 of the version's `deployment.sha256`, which
`docs/deployment.md` says to compare a mirrored copy against. The archive's list has SHA-256
`0924d1feabc0218f353c150259e97061484268dc75e4d47fa67884fec39a5ecc`.

The owner (2026-11-15): "Its fine to skip the demos page for 0.1.6, I watn to remove that version
anyways". v0.1.6 is online without its demos page, and its npm packages are deprecated (they do
not install). Removing it means moving `work/locks/published/v0.1.6` to `work/locks/retired/`
before a deployment's export, as v0.1.0 to v0.1.4 were; its tag and GitHub release stay, and the
local 9045 server keeps serving it for the owner's Donna sessions. Waits for the owner's go.

## Done when

The owner has decided; if removed, `https://slopshare.dev/v0.1.6/` answers 404 and v0.1.5 and
v0.1.7 still boot on both domains.
