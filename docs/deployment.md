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

GitHub Pages and `daugasauron.com` must consume the **same audited
`dolly-pages.tar.gz` release asset**, identified by its SHA-256 and source commit.
Do not rebuild images for the second host. Verify/extract that artifact, then use
`export:static` with `/dolly/` for GitHub and `export:pages` with `/` for the domain.
Both exports preserve the same sealed application, runtime, recipes and snapshot
bytes. Only public navigation prefixes and HTTP delivery headers/encoding differ.
Compare the decoded immutable assets to the shared `release/files.sha256` seal.

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

Cloudflare Pages is the selected high-traffic host. Its production site is
`https://dolly-9dk.pages.dev/`, project `dolly`; no Functions or storage bindings
are deployed. The September 8 deployment `e0e677db-e059-425c-8084-e0ad240bbf7c`
uses release `fe1e44c38acd11c07d82586d70b2315db26c7461d16b02c1e5afc64cab40ac7a`
from the same `pages-32d3b34-r1` artifact as GitHub Pages.

## Fixed-cost release candidate

The release target is flat-cost static delivery, not a metered application
backend. **Cloudflare Pages, without Functions**, documents free, unlimited static
requests. Its free-plan limits are 25 MiB per file, 20,000 files and 100 header
rules. [Static request pricing](https://developers.cloudflare.com/pages/functions/pricing/#static-asset-requests),
[Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

The Pages-specific exporter verifies sealed releases, Brotli-compresses oversized
binary downloads and emits `_headers`. It refuses assets that still exceed the
limits. The browser receives the original, hash-verified bytes through normal
HTTP decoding; no loader or Wasm import changes are needed. `dolly.data` shrinks
from 113,301,428 to 24,924,158 bytes with Brotli-9. Snapshot packs remain unchanged.
The exporter deliberately rejects new oversized browser-code assets until their
delivery is verified; it only compresses source artifacts and the compiler seed.

```sh
npm run export:pages -- build/releases/current build/pages-site
# Subsequent deployment: include every predecessor that must remain usable.
npm run export:pages -- build/releases/current build/pages-next build/releases/PREVIOUS_RELEASE_ID
```

Additional arguments are **sealed release directories**, not previous exports.
Their immutable assets are retained, shared packs deduplicated and only the
current release supplies public HTML. Limits fail before atomic publication;
old releases are never silently dropped. Keep the original sealed releases for
the next export. `deployment.sha256` describes the actual uploaded bytes,
including their encoded representation and headers. The original release's
manifest still describes the decoded application bytes.

Local Wrangler 4.129.1 Pages tests require opaque `application/octet-stream` for
compressed SOURCE downloads, including the Zig executable. With
`application/wasm`, its local server overwrites `Content-Encoding` and corrupts
delivery. Browser-loaded runtime modules remain `application/wasm` and are not
precompressed by this exporter. **Workers Static Assets is not interchangeable**:
its local server double-compresses even opaque precompressed files.

Check public Pages delivery after every export: decoded asset hashes, browser
boot/rebuild, cross-origin isolation, named-session restoration and old-release
URLs. Do not add a Function, Worker, R2 origin or proxy merely to pass these checks;
that changes the fixed-cost assumptions. September 8 public checks pass all 14
decoded compressed-download hashes, unchanged gzip packs, isolation/cache/MIME
headers, retained-release URLs and Studio's session file round-trip
(`build/stable-release-pages-public-{transport,sessions}.log`).
A cold system rebuild and its compiled filesystem inventory also pass
(`build/stable-release-pages-public-rebuild-2.log`).
The two-release export contains 2,820 files, about 674 MB total, with a largest
file of 24,980,297 bytes. These are deployment totals, not per-visitor downloads:
an image loads only its selected assets/packs.

Upload an already verified export with the authenticated CLI:

```sh
npx wrangler@4.129.1 pages deploy build/pages-next --project-name dolly --branch main
```

Verify the public release seal before switching a custom domain. Keep both the
sealed release and export manifest as the deployment receipt; do not rebuild
images for another host.

R2's zero egress fee is not a fixed bill: storage and origin reads are metered.
Budget alerts are not spending caps; a cap that stops serving also fails the
availability requirement. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
No finite hosting plan guarantees unlimited availability; provider terms and
upstream model-weight availability remain constraints even with free static traffic.

Target domain: `daugasauron.com`, replacing its existing site as requested.
GitHub Pages deployed first. The Cloudflare zone and Pages project share the same
account, and the domain is associated with the project. DNS remains pending:
the root CNAME must point to `dolly-9dk.pages.dev`. Wrangler's OAuth login can
deploy Pages but cannot edit DNS; finish the domain's DNS setup in the dashboard,
preserving unrelated records, then verify domain TLS, release seal and browser boot.

Another candidate is CloudFront's **$15/month Pro flat-rate plan**, with 50 TB
and 10 million requests as monthly allowances, not hard cutoffs. It has no CDN
overage charges; sustained excess usage can reduce delivery performance. Origin
costs remain separate: S3 storage credits do not establish a cap on S3 request
charges. An entirely fixed bill would also need a fixed-cost origin and bounded
ancillary services. This is a fallback to evaluate, not a purchased plan.
[Plan prices](https://docs.aws.amazon.com/PricingPlanManager/latest/UserGuide/plans.html),
[allowances and covered costs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).
