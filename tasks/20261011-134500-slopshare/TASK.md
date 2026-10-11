# The site moves to slopshare.dev

- STATUS: OPEN
- PRIORITY: 170
- TAGS: release,site

Owner (2026-10-11): "I just bought a new domain slopshare.dev, I want to rebrand
daugasauron.com into this domain completely." And: "I don't want to redirect, I want slopshare
to be the new source."

Done (2026-10-11, with the owner's token, scoped to Pages on the account and DNS on the zone):

- The zone `slopshare.dev` is active on Cloudflare (the owner moved its nameservers from
  Namecheap). Its parking record `A slopshare.dev 192.64.119.234` was replaced by a proxied
  `CNAME slopshare.dev dolly-9dk.pages.dev`; the mail records and `www` (still Namecheap's
  parking page) were left as they came.
- `slopshare.dev` is a custom domain of the Pages project `dolly`, beside `daugasauron.com`:
  the same deployment (`109069de`), so v0.1.0, v0.1.1 and v0.1.2 are served there. Through
  Cloudflare's address: `/` leads to `/v0.1.2/`, each version and `/v0.1.2/wine/` answer 200,
  `/wine/` and `/default/` 404 (the stale `/default/` of the old domain is not there).
- The repository names the new domain: `PUBLIC_ORIGIN`, the site argument of
  `package-pages.sh`, `sites/slopshare.dev/`, the checklist's commands, two tests, the README
  and two documents. Task records keep the old name; they are history. Source tests 424/0.

Not done:

- `daugasauron.com` was not touched: it still serves the same deployment, with no redirect,
  until the owner says to take it off. The GitHub Pages builds of v0.1.1 and v0.1.2 link the
  domain-only images there by absolute address and cannot be edited.
- The renamed tree is on local `main` only. It reaches the sites with the next version, which
  is a full rebuild; published versions keep the few texts that name the old domain.
- Saved sessions and cached images are the browser's per origin: they do not follow.
- The GitHub account's addresses (`daugasauron.github.io/dolly`, `github.com/daugasauron/dolly`)
  are another matter and were not asked for.
