# npm packages for v0.1.4: what is left before the owner publishes them

- STATUS: OPEN
- PRIORITY: 250
- TAGS: packages,release,0.1.4

The npm packages are the main feature of v0.1.4 (owner, 2026-10-24).

## State (2026-10-25)

Built by `scripts/package-npm.mjs` from a checkout with its images: `@daugasauron/dolly` (the
runtime and the host modules that are its machinery, 178 KB packed), ten
`@daugasauron/dolly-host-NAME` (one device module each, 1.5 to 17 KB) and
`@daugasauron/dolly-image-default` (7.1 MB). On the owner's word (2026-10-25): no bundler is
needed, and each host module and image depends on the runtime alone, at its own version; an
image does not depend on its host modules, which `docs/embedding.md` names to install. The
packages declare no peer dependencies.

`test/npm-browser.mjs` (Chromium and Firefox, in the round's suites) packs them, serves them from
a registry of their own, installs the guide's own command into an empty app with an empty npm
cache, and checks: the dependency rule over every manifest; the guide's page boots `default`
with exactly its fourteen host modules; a page with `gpu@0`, `microphone@0` and `pty@0` loads
them, enables `gpu@0` and holds the `http@0` policy it gives `boot()`; a page that lacks
`touch@0`, or isolation, says so.

Left:

- Publishing to npmjs under `@daugasauron`, with the release: the owner's step; nothing here
  publishes.
- Not tested: pnpm's and yarn's layouts. The guide says the packages must lie side by side
  under `node_modules/@daugasauron/`, which npm's layout gives.

Done when: the owner has published the v0.1.4 packages, and `npm install` of the guide's line
from npmjs gives what the test installs from its own registry.
