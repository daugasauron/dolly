# Release steps 4 to 8 are rewritten in work/ each release: the checklist prints commands that do not work as printed

- STATUS: OPEN
- PRIORITY: 170
- TAGS: audit,repo,release,deployment,0.1.8

## State (2026-11-19): RC1 runs as the checklist prints it; the release confirms steps 4 to 8

`scripts/release-checklist.sh` (`df6a9389a`, `ee2f1aa71`, then `fix/rc-release`) checks steps 1 to
3, assembles step 6's deployment and boots it from its directory (`published-version.mjs boot
DEPLOYMENT`, served by `pages-host.mjs`), and prints steps 4 to 8 as commands that work:

- Step 1 stops unless `scripts/round.sh verdict` passes on HEAD, the three seeds are pinned to
  this version's release assets with their bytes in `.cache`, and every version on the site's
  `robots.txt` (`Disallow: /vX.Y.Z/dist/`) has a directory in the archive or in `retired/`
  beside it. The version is read from `page/version.mjs`.
- Step 5: `gh release create` with the three seeds and `NOTES.md`, the notes written for the
  release, which name the deployment list's digest it prints there; a `fetch-verified-file.sh`
  per seed; `bash scripts/publish-npm.sh build/npm-vX.Y.Z`, in a terminal: a sign-in of its own
  (`--auth-type=web`, logged out at its end), each package of `build/npm-vX.Y.Z.order` not yet
  at the version published in that order with npm's approval in a browser, a refused one
  stopping it (run again, it resumes), then every tarball's SHA-512 against `npm view
  NAME@VERSION dist.integrity` (its check half run on 0.1.7's tarballs: 1 min 56 s).
- Step 6: `npx wrangler@4.129.1 pages deploy build/pages-vX.Y.Z --project-name dolly --branch
  main`, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` set by the owner.
- Step 7: both domains' boots and the file-by-file `verify`. Step 8: the archive's `mv`, the
  showcase's packaging and `--showcase` run (`tasks/20261116-140230-repo-06`), and after it
  the bump, `DOLLY_VERSION` in `page/version.mjs`, the one line that names it
  (`tasks/20261116-140453-buildtime-01`, closed).
- A release candidate is the checklist's header, step by step: the round until its verdict
  passes, the site packaged without its showcase (`DOLLY_BUILD_IMAGES` the domain catalog), the
  checklist; its output begins with the candidate's two commands, `npm run serve RELEASES` and
  `node scripts/npm-registry.mjs build/npm-vX.Y.Z`, a registry of the tested tarballs that
  sends any other name to npmjs (test/npm-browser.mjs's own, now a script it imports).

RC1 rehearsed on 2026-11-19 in `work/rc-release` with the round's images (`dolly-round-018k`),
the round's records there stand-ins and the archive a hard-linked copy of
`work/locks/published` (`build/rehearse/`, `rc.sh`, its logs). Each stop was where a step as
printed would not have worked:

- Step 1 sourced `config/source-pins.sh` alone, so `DOLLY_RUST_SEED_URL` was unbound
  (`04f641d39`: the Rust and Go demos' pins too).
- Step 6: v0.1.5 to v0.1.7 hold 15,088 files and v0.1.8 5,589, 681 past Pages' 20,000. The
  exporter refused with node's stack; the checklist now stops with the `mv` of the oldest
  version into `retired/`, which step 1 accepts, and "run this again" (`5e5d1fc02`). So v0.1.5
  leaves the site with 0.1.8, and 0.1.8's notes say so (docs/deployment.md, owner 2026-11-07).
- Step 6's boot: "v0.1.8: amy list failed": it asked for curl installed, which 0.1.8's default
  no longer installs (`778f3efbb`); it asks for an installed package (`dd91a4a3f`).
- Step 5 named `NOTES` and printed the digest the notes need at step 8, after it; step 8 moved
  the version before the showcase (`445d47bc7`).

Then the whole run passed on `6efdd52cf`: packaging 17 min (12:40 to 12:57; 262 images, 2,470
packs), the checklist 16 min (the npm test in Chromium 221 s and Firefox 187 s; the deployment
16,044 files, 17 header rules, 98 files and 1.25 GB its own, the rest links; v0.1.6 to v0.1.8
boot in both browsers). Its candidate's commands, as printed: the server answers `/` with a
302 to `/v0.1.8/`, which is 200, and `/default/` 404; `npm install @daugasauron/dolly-build`
from the registry, in an empty app with an empty cache, took 21 packages at 0.1.8 from it and
playwright-core from npmjs.

What only 0.1.8's release confirms: steps 4 to 8 run as printed, with no `work/` script beyond
the machine's own lines (credentials, the unit).

## Found

`scripts/release-checklist.sh` ends by printing the commands of steps 4 to 8 "for the owner to
run" (`:73-90`). Neither of the last two releases ran them as printed. Each was released by new
scripts in `work/`: 0.1.6 by 12 (729 lines), 0.1.7 by 9 (558 lines, `work/release-0.1.7*.sh`).
Where the printed command does not work, or a step is missing from it:

- npm (step 5). The printed `npm publish "${tarball}" --access public` fails for this account:
  "npm refuses this account's bypass 2FA tokens (npm/cli#9268)" (`work/release-0.1.7-npm-web.sh:5`).
  The release used `--auth-type=web` with a sign-in per publish, resumed past packages already
  published, and then checked that the registry holds the tested bytes (`npm view NAME@VERSION
  dist.integrity` against each tarball's SHA-512, `:77-84`). That last check is the only proof the
  published packages are the tested ones, and it exists only in `work/`. The script was copied from
  0.1.6's `release-0.1.6-npm-web.sh`, with 0.1.6's `-npm.sh`, `-npm-otp.sh` and `-npm-latest.sh`
  before it.
- The deployment (step 6). The printed `npx wrangler@4.129.1 pages deploy` has no account. The
  release reads `CLOUDFLARE_ACCOUNT_ID` from `work/release-0.1.6-cloudflare-account` and the token
  from `~/.cloudflare` (`work/release-0.1.7.sh:105-106`).
- The archive (steps 1 and 8). 0.1.6's step 8 was never run: 0.1.7's script archived v0.1.6
  itself, from `build/pages-v0.1.6-core`, before running the checklist (`work/release-0.1.7.sh:41-44`).
  It also retired v0.1.4 by `mv` (`:45`). The checklist needs the archive complete before it runs,
  and nothing checks that the newest published version is in it. Without that `cp`, step 6 would
  have assembled a deployment without v0.1.6, and so removed it from the site ("a deployment
  assembled without a version removes that version", `docs/deployment.md`). The local and live
  boots take their versions from that same deployment (`scripts/release-checklist.sh:71`), so
  they would not have noticed. (Read from the scripts; not run.)
- The version bump (step 8). The printed step names `package.json` and `page/version.mjs`. The bump
  to 0.1.7 (`653727235`) also rewrote the site references of 229 Dollyfiles to the new version, as
  `scripts/update-recipe-pins.mjs` writes them. It also moved `package-lock.json`, and the version
  named in `README.md:132` and in `AGENTS.md`'s tag example. The seed compiler's URL
  moved in a separate commit after the round (`9c589654e`). What the bump costs, and whether
  recipes should name the version at all, is `tasks/20261116-140453-buildtime-01`.

This departs from "Development iteration speed is king". A release step that exists only in
`work/` is found again at the next release, as 0.1.6's npm scripts were.

## Do

- The checklist prints the commands that work. Step 5 publishes with `--auth-type=web` in
  `build/npm-vX.Y.Z.order`'s order and skips a package already at the version. A script in
  `scripts/` checks every listed tarball's integrity against the registry, and the checklist names
  it. Step 6 says where the account comes from (an environment variable the owner sets).
- Step 1 fails unless the archive holds every version the live site serves. Each version on the
  root's `robots.txt` lines must have a directory in the archive.
- Step 8 names every file and command of the bump, in whatever form
  `tasks/20261116-140453-buildtime-01` leaves it.

## Done when

0.1.8 is released with the checklist's printed commands and no `work/` script beyond the machine's
own lines (credentials, the unit).
