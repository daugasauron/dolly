# Deployment

Dolly deploys as static files: no server code, Functions or proxy. The same
packaging serves [daugasauron.com](https://daugasauron.com/) (Cloudflare Pages
project `dolly`, full catalog) and
[GitHub Pages](https://daugasauron.github.io/dolly/) (a smaller catalog within
its 1 GB limit).

```mermaid
flowchart LR
  images["dist/ snapshots"] --> pkg["package-pages.sh: sealed release"]
  pkg --> rel["RELEASES/ID"]
  rel --> serve["npm run serve (local)"]
  rel --> static["export-static.mjs: any static host"]
  rel --> cf["export-cloudflare-pages.mjs, then wrangler"]
```

## Package and export

Use one catalog for source preparation, snapshots and packaging:

```sh
export DOLLY_BUILD_IMAGES="$(paste -sd, config/domain-pages-images.txt)"
npm run image

# daugasauron.com: export with predecessor releases, then upload.
bash scripts/package-pages.sh build/domain-releases daugasauron.com
npm run export:pages -- build/domain-releases/current build/pages-next build/domain-releases/PREVIOUS_ID
npx wrangler@4.129.1 pages deploy build/pages-next --project-name dolly --branch main

# GitHub Pages (github-pages-images.txt): attach the release as a tarball to a
# GitHub release, then run the workflow with its tag, SHA-256 and commit.
bash scripts/package-pages.sh build/github-releases github-pages
tar -C build/github-releases/current -czf build/dolly-pages.tar.gz .
sha=$(sha256sum build/dolly-pages.tar.gz | cut -d' ' -f1) tag=pages-$(git rev-parse --short=7 HEAD)-r1
gh release create "$tag" build/dolly-pages.tar.gz --target "$(git rev-parse HEAD)"
gh workflow run pages.yml -f release_tag="$tag" -f artifact_sha256="$sha" -f source_commit="$(git rev-parse HEAD)"
```

- Catalogs: [`domain-pages-images.txt`](../config/domain-pages-images.txt) and
  [`github-pages-images.txt`](../config/github-pages-images.txt); dependencies are
  included automatically.
- The second packaging argument selects the site: `daugasauron.com` adds the
  `/agents/` showcase ([`package-domain.mjs`](../scripts/package-domain.mjs));
  `github-pages` links Studio, Pi Local and 0 A.D. to the domain
  ([`package-github-pages.mjs`](../scripts/package-github-pages.mjs)).
- [`package-pages.sh`](../scripts/package-pages.sh) `RELEASES SITE` seals a
  release into `RELEASES/ID` and points `RELEASES/current` at it (default
  `build/releases`);
  [`site-release.mjs`](../scripts/site-release.mjs) verifies it.
  `npm run serve [RELEASES]` serves only that directory's current release.
- `.github/workflows/pages.yml` verifies the artifact and source,
  then runs `export-static.mjs` with the Pages prefix. Exporters verify the sealed
  input, refuse an existing destination, publish atomically and upload nothing;
  `sha256sum --check deployment.sha256` checks an export.
- Pass predecessor releases to `export:pages` so open tabs keep their immutable
  assets; GitHub Pages replaces the whole site on each deploy. Limits fail
  before publication and never silently drop a predecessor.

## Delivery contract

| Path under the public prefix | Caching |
| --- | --- |
| `_dolly/RELEASE/` code, recipes, sources | Immutable |
| `dist/packs/HASH.snapshot.gz` | Immutable |
| HTML, `coi-serviceworker.js` and `robots.txt` | No-store |

- Every URL is a file at its checkout path (directories serve `index.html`;
  [`generate-routes.mjs`](../scripts/generate-routes.mjs) writes the menu, image
  routes and recipe views), so no host needs rewrite rules. Unknown paths get
  the packaged `404.html` with status 404; missing assets must never get an HTML
  success response.
- Send `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp` and
  `Cross-Origin-Resource-Policy: same-origin` where possible; otherwise
  [`coi-serviceworker.js`](../coi-serviceworker.js) isolates same-origin
  responses and passes cross-origin broker requests through unchanged.
- Snapshot `.gz` files are application payloads: never mark them
  `Content-Encoding: gzip`.
- The Cloudflare exporter splits oversized sources, packs and the compiler seed
  `dist/dolly.data` into verified 20 MiB parts
  ([`static-asset.mjs`](../src/static-asset.mjs)) and Brotli-compresses large
  downloads as `application/octet-stream`: the tested Pages runtime overwrites
  the encoding of Wasm MIME types. Do not substitute Workers Static Assets; its
  tested encoding behavior differs. Runtime JavaScript and Wasm are never
  precompressed or split.
- Disable CDN HTML rewriting, email obfuscation and injected analytics; they
  change the reviewed page. Serve Dolly from its own origin when sessions matter:
  storage is shared by every site on an origin.

## Release rules

- Upload immutable assets before switching HTML, and never replace existing
  immutable bytes: the release hash in asset URLs keeps an open tab from mixing
  releases.
- Compare decoded immutable bytes against `release/files.sha256`, not the
  compressed wire representation.
- Verify delivered hashes and requests, not dashboard settings. Never put
  credentials in build artifacts or edit source while sealing.
- Docs publish every git-tracked text file they link outside `demos/`
  ([`package-documentation.mjs`](../scripts/package-documentation.mjs)).
