# Remove v0.1.6 from the site (waits for the owner)

- STATUS: OPEN
- PRIORITY: 60
- TAGS: site,0.1.8

The owner (2026-11-15): "Its fine to skip the demos page for 0.1.6, I watn to remove that version
anyways". v0.1.6 is online without its demos page, and its npm packages are deprecated (they do
not install). Removing it means moving `work/locks/published/v0.1.6` to `work/locks/retired/`
before a deployment's export, as v0.1.0 to v0.1.4 were; its tag and GitHub release stay, and the
local 9045 server keeps serving it for the owner's Donna sessions. Waits for the owner's go.

## Done when

The owner has decided; if removed, `https://slopshare.dev/v0.1.6/` answers 404 and v0.1.5 and
v0.1.7 still boot on both domains.
