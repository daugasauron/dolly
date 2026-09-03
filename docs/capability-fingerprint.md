# Capability fingerprints

Dolly separates machine authority from image contents. Generate both identities
for any sealed image with:

```sh
npm run fingerprint -- default
npm run fingerprint -- gamedev
npm run fingerprint -- python
```

The command first verifies the snapshot's byte length, SHA-256, image name, and
runtime build ID against its generated metadata. It then parses the main Wasm
module itself and requires every exact typed browser import to belong to one
group in `config/browser-imports.json`. Missing, duplicated, or unclassified
imports fail the command. The network group must still contain exactly
`env.dolly_http_dispatch`.

The generated `build/capability-fingerprint-IMAGE.json` has two useful hashes:

- `authoritySha256` covers the typed browser imports, the embedded `dolly.abi`
  contract stamp, each compiled canonical WAT contract's normalized typed
  interface, and the sole network edge. Comments and formatting cannot change
  this authority identity; adding a utility entirely above the substrate
  should not change it.
- `fingerprintSha256` additionally covers the main runtime bytes, image recipe
  chain, entry point, retained-path manifest, sealed snapshot, and ABI source
  provenance. Any change to the distributed capsule or its contract source
  should change this value.

These are audit identities, not signatures or grants. Browser-side destination,
credential, redirect, quota, and approval policy remains embedding
configuration and is deliberately not baked into a reusable image. Secrets and
HTTP response data are never included.
