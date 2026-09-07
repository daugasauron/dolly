# Static deployment

Build and browser-verify the normal release first (`npm run publish`). Export
that sealed release into a new directory; the parent directory must exist:

```sh
npm run export:static -- build/releases/current build/static-site /
```

Use `/dolly/` instead of `/` when hosting below that prefix. The exporter verifies
the complete release, reads only its sealed files, refuses existing destinations,
and publishes its owned staging directory only after completion. It does not
upload anything. `deployment.sha256` checks the exported bytes with
`sha256sum --check deployment.sha256` from the output directory.

## Delivery contract

All paths below are relative to the configured public prefix.

| Path | Contents | Cache policy |
| --- | --- | --- |
| `_dolly/RELEASE/` | Immutable application code, recipes, source archives and runtime assets | `public, max-age=31536000, immutable` |
| `dist/packs/HASH.snapshot.gz` | Shared content-addressed snapshot packs, stored only once | `public, max-age=31536000, immutable` |
| Public HTML, `coi-serviceworker.js` | Clean navigation and isolation bootstrap | `no-store` |

HTML pins its resources to one release while links stay clean (`/gamedev/`,
`/session/`, `/custom/`). There is no runtime asset-server configuration or
guest-controlled asset origin. An edge server can route the two immutable path
prefixes to object storage and the small HTML pages to another backend, while
the browser still sees one HTTPS origin. This does not change Dolly's HTTP broker.

Serve directory routes through `index.html`. Unknown navigations must serve the
packaged `404.html`, retaining the requested URL and HTTP 404 status; this enables
first visits to `/session/NAME`. Missing assets must remain failures, not receive
an HTML success response. Preserve MIME types, especially JavaScript modules and
`application/wasm`.

Prefer these response headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

On hosts without configurable headers, the service worker establishes isolation
for same-origin responses. It lives at the public application root, not under
the immutable release prefix. Cross-origin broker requests pass through unchanged.
Snapshot `.gz` files are compressed application payloads: do **not** mark them
`Content-Encoding: gzip`; Dolly explicitly decompresses and verifies those bytes.
Ordinary HTTP compression can be used for uncompressed application assets.

## Publishing and retention

Upload immutable assets first, verify their hashes, then switch the public HTML
as one deployment. Never replace bytes at an existing immutable URL. Keep old
release directories and snapshot packs available for open tabs; the exporter
emits one release, so the deployment's storage policy must preserve predecessors.
Do not use a destructive sync of a single export over all existing assets.

The GitHub Pages workflow verifies the audited input artifact and exports this
layout using the configured Pages prefix. Pages replaces the whole deployment;
one-release uploads do not preserve assets for old tabs. It also limits published
sites to 1 GB and has a 100 GB/month soft bandwidth limit, making it a constrained
demo target rather than the intended high-load deployment.
[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

For larger deployment, keep the same path layout behind an object-store/CDN
origin. With R2, production caching requires a custom domain and appropriate
cache rules; the `r2.dev` endpoint is rate-limited development hosting.
[R2 public-bucket documentation](https://developers.cloudflare.com/r2/buckets/public-buckets/).
Provider selection, account changes, load testing and public deployment remain
separate decisions. No provider has been configured by this preparation.
