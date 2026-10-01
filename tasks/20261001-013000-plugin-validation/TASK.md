# Kernel plugin links accept imports the runtime loader rejects

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: bug,compiler,core,display

Found by the Zig self-hosting spike: `validate_shared_object` in
`src/compiler.cpp` passes `allow_unresolved_provider = providers.empty()`, so a
kernel plugin with no needed libraries links with arbitrary `env.*` imports. The
runtime loader (`src/kernel-plugin.mjs`) then rejects them at boot
(`unsupported resident plugin import: env.strlen`).

Done when: linking such a plugin fails with the unsupported import named, and a
test links one plugin that imports only the kernel plugin contract and one that
does not.

## Verified (2026-10-01)

`f3c6496` rejects kernel-plugin imports outside the contract at link time;
`a02bdc0` makes the test plugin export its entry so its outside import reaches
the link. `test/cpp-browser.mjs` (a plugin importing only the contract links;
one importing `outside` fails and leaves no output) passes in Chrome and
Firefox on the rebuilt `rebuild-batch` catalog.
