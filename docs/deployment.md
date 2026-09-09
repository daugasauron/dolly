# Static deployment

The public sites are [GitHub Pages](https://daugasauron.github.io/dolly/) and
[daugasauron.com](https://daugasauron.com/), backed by the Cloudflare Pages
project `dolly`. They consume the same audited `dolly-pages.tar.gz` artifact,
not separately rebuilt images. The [handoff](audit-handoff.md) records the checkpoint.

## Export

First publish and browser-verify a sealed release. Export to a new directory
whose parent already exists:

```sh
npm run export:static -- build/releases/current build/static-site /dolly/
npm run export:pages -- build/releases/current build/pages-site
```

The static exporter uses the supplied prefix; the Pages exporter uses `/`.
Both verify sealed input, reject an existing destination and publish staging
atomically. Neither uploads anything. Run `sha256sum --check deployment.sha256`
inside an export to verify its uploaded bytes.

Local packages can contain the complete image catalog. The GitHub deployment
workflow checks its 1 GB limit against the exported site before upload.

GitHub's manual workflow consumes the audited artifact and uses `/dolly/`.
The domain uses that same artifact with root navigation and Pages-specific
delivery headers/encoding. Compare decoded immutable bytes against
`release/files.sha256`, not compressed wire representations.

## Delivery contract

| Path, relative to public prefix | Cache behavior |
| --- | --- |
| `_dolly/RELEASE/` code, recipes and source/runtime assets | Immutable |
| `dist/packs/HASH.snapshot.gz` shared snapshot packs | Immutable |
| Public HTML and `coi-serviceworker.js` | No-store |

User routes stay clean, such as `/gamedev/`, `/custom/` and `/session/NAME`;
the hash in asset URLs prevents an open tab from mixing releases.

Serve directory `index.html` files. Unknown navigations use the packaged
`404.html`, preserving URL and 404 status for first visits to named sessions.
Missing assets must not receive an HTML success response. Preserve MIME types.

Prefer `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp` and
`Cross-Origin-Resource-Policy: same-origin`. On hosts without these headers,
the root service worker establishes isolation for same-origin responses;
cross-origin broker requests pass through unchanged.

Snapshot `.gz` files are application payloads: do **not** mark them
`Content-Encoding: gzip`. Dolly decompresses and verifies those bytes itself.

## Cloudflare Pages

This deployment is static only: no Functions, Worker, R2 origin or proxy.
The Pages exporter enforces its configured file/count/header limits and
Brotli-compresses oversized source/compiler downloads. Incompressible source
archives and large snapshot packs use 20 MiB file parts. Their original URL
returns a bounded manifest with `X-Dolly-Parts: 1`; Dolly verifies and joins the
fixed sibling parts before consuming the original bytes. Snapshot gzip encoding
is unchanged. Browser-loaded runtime code is not precompressed or split.

Compressed SOURCE downloads use `application/octet-stream`: the tested Pages
runtime otherwise overwrites the encoding for Wasm MIME types. Do not substitute
Workers Static Assets; its tested encoding behavior is different.

```sh
# Include sealed predecessor releases needed by existing tabs.
npm run export:pages -- build/releases/current build/pages-next build/releases/PREVIOUS_RELEASE_ID
npx wrangler@4.129.1 pages deploy build/pages-next --project-name dolly --branch main
```

Predecessor arguments are sealed release directories, not old exports.
Their immutable assets are retained and packs deduplicated; only the current
release supplies public HTML. Retention verifies every recorded byte and its
original inventory-acceptance receipt, without imposing newer recipe or
documentation rules on old releases. The current release passes all current
checks. An older release without multipart support cannot
be retained if it needs an oversized, incompressible asset. Limits fail before
publication, never silently dropping predecessors.

Disable CDN HTML rewriting, email obfuscation and injected analytics. They alter
the reviewed browser code or source views. Verify delivered hashes and requests,
not just dashboard settings. Do not place credentials in build artifacts.

## Release checks and retention

Verify decoded hashes, MIME/isolation/cache headers, boot/rebuild, named-session
restoration and old-release URLs after deployment. Keep source commit, sealed
release and export manifest as receipts. Do not edit source during sealing.

Upload immutable assets before switching HTML; never replace existing immutable
bytes. Keep predecessor releases for pinned tabs. GitHub Pages replaces a whole
deployment, so exporting only one release does not preserve old tabs.

Flat-cost expectations depend on remaining static-only and within provider
terms. Consult [Pages limits](https://developers.cloudflare.com/pages/platform/limits/),
[static request pricing](https://developers.cloudflare.com/pages/functions/pricing/#static-asset-requests)
and [GitHub limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
before changing delivery. These do not guarantee unlimited availability or
availability of external model-weight hosts.
