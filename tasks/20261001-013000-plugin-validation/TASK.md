# Kernel plugin links accept imports the runtime loader rejects

- STATUS: OPEN
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
