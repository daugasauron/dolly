#!/usr/bin/env bash
# The release checklist of docs/deployment.md, as far as a script can check it, for the site
# packaged from HEAD:
#   scripts/release-checklist.sh RELEASES [ARCHIVE]              the version's deployment
#   scripts/release-checklist.sh --showcase RELEASES [ARCHIVE]   its later one, with its showcase
# It verifies, assembles the deployment and boots it. It never tags, pushes, publishes, uploads
# or deploys: it ends by printing the commands that do, for the owner to run.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
showcase=""
[[ "${1:-}" != --showcase ]] || { showcase=1; shift; }
[[ $# -ge 1 ]] || { echo "usage: release-checklist.sh [--showcase] RELEASES [ARCHIVE]" >&2; exit 64; }
domain="$(realpath -- "$1")/current"
archive="$(realpath -- "${2:-${project_dir}/published}")"
cd "${project_dir}"
# The npm packages are of the whole catalog, whichever images were packaged last.
unset DOLLY_BUILD_IMAGES
version="v$(sed -n 's/^export const DOLLY_VERSION = "\(.*\)";$/\1/p' page/version.mjs)"
commit="$(git rev-parse HEAD)"
site=https://slopshare.dev
stop() { echo "dolly: release stopped: $*" >&2; exit 1; }
began="${SECONDS}"
step() { echo "== $* ($(((SECONDS - began) / 60)) min)"; }

step "1 the tree is clean; ${version} is ${showcase:+published without its showcase and }tagged nowhere else"
[[ -z "$(git status --porcelain)" ]] || stop "the tree has uncommitted changes"
tagged="$(git rev-parse -q --verify "refs/tags/${version}^{commit}" || true)"
[[ -d "${archive}" ]] || stop "no archive of published versions at ${archive} (before the first release: an empty directory)"
if [[ -n "${showcase}" ]]; then
  [[ -n "${tagged}" ]] && git merge-base --is-ancestor "${tagged}" HEAD || stop "HEAD does not follow the tag ${version}"
  outside="$(git diff --name-only "${tagged}" HEAD | grep -v -e '^sites/slopshare\.dev/agents/' -e '^tasks/' || true)"
  [[ -z "${outside}" ]] || stop "commits since ${version} change more than its showcase: ${outside//$'\n'/ }"
  [[ -d "${archive}/${version}" && ! -e "${archive}/${version}/agents" ]] || stop "${archive} holds no ${version} without a showcase"
else
  [[ -z "${tagged}" || "${tagged}" == "${commit}" ]] || stop "tag ${version} names ${tagged}, not HEAD"
  [[ ! -e "${archive}/${version}" ]] || stop "${version} is already published; a fix is a new version"
  bash scripts/round.sh verdict || stop "no round passed on HEAD: scripts/round.sh"
  source config/source-pins.sh
  seed_compiler=".cache/dolly-seed-compiler-${DOLLY_SEED_COMPILER_SHA256}.tar"
  [[ "${DOLLY_SEED_COMPILER_URL}" == "https://github.com/daugasauron/dolly/releases/download/${version}/${seed_compiler#.cache/}" &&
     -f "${seed_compiler}" ]] || stop "the seed compiler is not pinned to this release's asset (docs/sources.md)"
  # A deployment assembled without a version removes it: each the site serves is in the archive,
  # or retired beside it.
  robots="$(curl -fsS "${site}/robots.txt")" || stop "${site}/robots.txt does not say which versions the site serves"
  for live in $(sed -n 's|^Disallow: /\(v[0-9.]*\)/dist/$|\1|p' <<< "${robots}"); do
    [[ -d "${archive}/${live}" || -d "${archive}/../retired/${live}" ]] || stop "${site} serves ${live}, which ${archive} lacks"
  done
fi

step "2 no token-shaped string in the unpushed commits or the image snapshots"
# An AWS access key ID is AKIA and 16 base32 characters; Pillow's ImageFont.py has AKIA in base64.
tokens='sk-ant-[A-Za-z0-9_-]{20,}|sk-or-v1-[0-9a-f]{32,}|sk-proj-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z2-7]{16}|xox[baprs]-[A-Za-z0-9-]{20,}'
# A key's PEM header ends its line; GLib's parser keeps one as a string that ends in NUL.
pem='-----BEGIN [A-Z ]*PRIVATE KEY-----[[:cntrl:]]?$'
git rev-parse -q --verify origin/main > /dev/null || stop "origin/main is unknown, so nothing says which commits a push would publish"
compgen -G "dist/dolly-*-system.snapshot" > /dev/null || stop "dist/ holds no image snapshot"
# Test fixtures say what they are: not-a-real-key.
found="$({ git log -p origin/main..HEAD | { /usr/bin/grep -a -o -E "${tokens}|${pem}" || true; }
  cat dist/dolly-*-system.snapshot | { /usr/bin/grep -a -o -E "${tokens}" || true; }; } |
  { /usr/bin/grep -v not-a-real-key || true; } | cut -c1-12 | sort -u)"
[[ -z "${found}" ]] || stop "token-shaped strings begin: ${found//$'\n'/ }"
# An image may ship an upstream's public test key, which config/public-test-keys.txt
# lists by the SHA-256 of its PEM block.
for snapshot in dist/dolly-*-system.snapshot; do
  while IFS=: read -r offset _; do
    # One write of 16 KiB, which the pipe holds whole: awk may stop reading before its end.
    digest="$(dd if="${snapshot}" iflag=skip_bytes skip="${offset}" bs=16384 count=1 status=none |
      awk '{ print } /-----END [A-Z ]*PRIVATE KEY-----/ { exit }' |
      sed -E '$ s/(-----END [A-Z ]*PRIVATE KEY-----).*/\1/' | sha256sum | cut -c1-64)"
    /usr/bin/grep -q "^${digest} " config/public-test-keys.txt ||
      stop "${snapshot} holds a private key at byte ${offset} that config/public-test-keys.txt does not list"
  done < <(/usr/bin/grep -a -b -o -E -- "${pem}" "${snapshot}" || true)
done

step "3 the site is sealed from ${commit:0:8}, accepted, and is ${version}${showcase:+ with its showcase}"
node scripts/site-release.mjs verify "${domain}" . ||
  stop "${domain} is not packaged from this tree: bash scripts/package-pages.sh RELEASES${showcase:+ slopshare.dev}"
if [[ -n "${showcase}" ]]; then
  [[ -f "${domain}/agents/index.html" ]] || stop "${domain} has no showcase: bash scripts/package-pages.sh RELEASES slopshare.dev"
else
  [[ ! -e "${domain}/agents" ]] || stop "${domain} has a showcase, which a later deployment adds: bash scripts/package-pages.sh RELEASES"
fi

npm_dir="build/npm-${version}"
if [[ -z "${showcase}" ]]; then
  step "3 the npm packages: packed from ${commit:0:8}, installed into an empty app and booted"
  rm -rf -- "${npm_dir}"
  # The packager lists the tarballs each after those it depends on: published in that order, a
  # package npm refuses stops the publish before anything that needs it is out.
  node scripts/package-npm.mjs "${npm_dir}" > "${npm_dir}.order"
  DOLLY_NPM_PACKS="${npm_dir}" node test/npm-browser.mjs > "${npm_dir}.log" 2>&1 ||
    stop "the npm packages do not boot: ${npm_dir}.log"
fi

step "6 the deployment: every published version and ${version}${showcase:+ with its showcase}"
deployment="build/pages-${version}"
rm -rf -- "${deployment}"
node scripts/export-cloudflare-pages.mjs "${archive}" "${deployment}" "${domain}"
[[ -d "${deployment}/${version}" ]] || stop "the domain site is not ${version}"
versions="$(cd "${deployment}" && echo v*)"
step "6 every version boots from the deployment, served as Pages serves it"
node scripts/published-version.mjs boot "${deployment}" ${versions} || stop "a version does not boot from ${deployment}"

if [[ -n "${showcase}" ]]; then
cat <<COMMANDS
== checked at ${commit} ($(((SECONDS - began) / 60)) min): deployment $(find "${deployment}" -type f | wc -l) files.
   Nothing was pushed or deployed. The owner runs, in ${project_dir}:
6  with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN set, where nothing interrupts it (an
   interrupted upload keeps nothing: never restart it):
   npx wrangler@4.129.1 pages deploy ${deployment} --project-name dolly --branch main > build/deploy-${version}-showcase.log 2>&1
7  node scripts/published-version.mjs boot ${site} ${versions}
   node scripts/published-version.mjs boot https://daugasauron.com ${versions}
   node scripts/published-version.mjs verify ${site} ${deployment} ${version} ${archive}
8  mv ${archive}/${version} build/pages-${version}-core && mv ${deployment}/${version} ${archive}/ && rm -rf ${deployment} build/pages-${version}-core
   git push origin main
   gh release edit ${version} --notes-file NOTES, which names ${version}'s list as deployed now:
   $(sha256sum "${deployment}/${version}/deployment.sha256" | cut -d' ' -f1)
   Then the next version: DOLLY_VERSION in page/version.mjs, the one line that names it.
COMMANDS
  exit
fi
cat <<COMMANDS
== checked at ${commit} ($(((SECONDS - began) / 60)) min): deployment $(find "${deployment}" -type f | wc -l) files.
   Nothing was tagged, pushed, published or deployed. The owner runs, in ${project_dir}:
4  git tag -a ${version} -m "Dolly ${version#v}" ${commit}
   git push origin main ${version}
5  gh release create ${version} ${seed_compiler} --verify-tag --title "Dolly ${version}" --notes-file NOTES
   bash scripts/publish-npm.sh ${npm_dir}    (in a terminal: npm signs in and approves in a browser)
6  with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN set, where nothing interrupts it (an
   interrupted upload keeps nothing: never restart it):
   npx wrangler@4.129.1 pages deploy ${deployment} --project-name dolly --branch main > build/deploy-${version}.log 2>&1
7  node scripts/published-version.mjs boot ${site} ${versions}
   node scripts/published-version.mjs boot https://daugasauron.com ${versions}
   node scripts/published-version.mjs verify ${site} ${deployment} ${version}
8  mv ${deployment}/${version} ${archive}/ && rm -rf ${deployment}
   then move page/version.mjs to the next version
   ${version}'s list, for the release notes: $(sha256sum "${deployment}/${version}/deployment.sha256" | cut -d' ' -f1)
   Then its showcase, recorded on ${site}/${version}/ and committed to sites/slopshare.dev/agents/,
   before the version moves on:
   bash scripts/package-pages.sh RELEASES slopshare.dev && bash scripts/release-checklist.sh --showcase RELEASES ${archive}
COMMANDS
