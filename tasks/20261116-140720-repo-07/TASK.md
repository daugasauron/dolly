# Release steps 4 to 8 are rewritten in work/ each release: the checklist prints commands that do not work as printed

- STATUS: OPEN
- PRIORITY: 170
- TAGS: audit,repo,release,deployment,0.1.8

## State (2026-11-17): fixed on `ws/release`; 0.1.8's release confirms it

`scripts/release-checklist.sh` (`df6a9389a`, `ee2f1aa71`) checks steps 1 to 3, assembles step 6's
deployment and boots it from its directory (`published-version.mjs boot DEPLOYMENT`, served by
`pages-host.mjs`), and prints steps 4 to 8 as commands that work:

- Step 1 stops unless `scripts/round.sh verdict` passes on HEAD, and unless every version on the
  site's `robots.txt` (`Disallow: /vX.Y.Z/dist/`) has a directory in the archive or in `retired/`
  beside it (on 2026-11-17: v0.1.5, v0.1.6, v0.1.7). The version is read from `page/version.mjs`.
- Step 5: `bash scripts/publish-npm.sh build/npm-vX.Y.Z`, in a terminal: a sign-in of its own
  (`--auth-type=web`, logged out at its end), each package of `build/npm-vX.Y.Z.order` not yet at
  the version published in that order with npm's approval in a browser, a refused one stopping
  it (run again, it resumes), then every tarball's SHA-512 against `npm view NAME@VERSION
  dist.integrity`. Its check half run on 0.1.7's `build/npm-v0.1.7` (work/round1113, read only):
  every package already published, "the registry holds every package … byte for byte the tested
  tarball" (1 min 56 s). The QR codes of `work/release-0.1.7-npm-web.sh` (a downloaded package)
  are not in it: npm prints its links.
- Step 6: `npx wrangler@4.129.1 pages deploy build/pages-vX.Y.Z --project-name dolly --branch
  main`, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` set by the owner.
- Step 7: both domains' boots and the file-by-file `verify`. Step 8: the archive's `mv`, the
  showcase's packaging and `--showcase` run (`tasks/20261116-140230-repo-06`), and the bump,
  written for DOLLY 8 (`ws/versionless`, `95ba9c87e`): `DOLLY_VERSION` in `page/version.mjs`,
  the one line that names it. The seed compiler's URL moves at the next round's `compiler` stage.

What only 0.1.8's release confirms: it is released with these printed commands and no `work/`
script beyond the machine's own lines (credentials, the unit).


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
