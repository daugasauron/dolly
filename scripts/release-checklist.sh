#!/usr/bin/env bash
# The release checklist of docs/deployment.md, as far as a script can check it,
# for the site packaged from HEAD:
#   scripts/release-checklist.sh RELEASES [ARCHIVE]
# It verifies and assembles the deployment.
# It never tags, pushes, uploads or deploys: it ends by printing the commands
# that do, for the owner to run.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# -ge 1 ]] || { echo "usage: release-checklist.sh RELEASES [ARCHIVE]" >&2; exit 64; }
domain="$(realpath -- "$1")/current"
archive="$(realpath -- "${2:-${project_dir}/published}")"
cd "${project_dir}"
version="v$(node -p "require('./package.json').version")"
commit="$(git rev-parse HEAD)"
stop() { echo "dolly: release stopped: $*" >&2; exit 1; }
step() { echo "== $*"; }

step "1 the tree is clean; ${version} is neither tagged elsewhere nor published"
[[ -z "$(git status --porcelain)" ]] || stop "the tree has uncommitted changes"
tagged="$(git rev-parse -q --verify "refs/tags/${version}^{commit}" || true)"
[[ -z "${tagged}" || "${tagged}" == "${commit}" ]] || stop "tag ${version} names ${tagged}, not HEAD"
[[ -d "${archive}" ]] || stop "no archive of published versions at ${archive} (before the first release: an empty directory)"
[[ ! -e "${archive}/${version}" ]] || stop "${version} is already published; a fix is a new version"
source config/source-pins.sh
seed_compiler=".cache/dolly-seed-compiler-${DOLLY_SEED_COMPILER_SHA256}.tar"
[[ "${DOLLY_SEED_COMPILER_URL}" == "https://github.com/daugasauron/dolly/releases/download/${version}/${seed_compiler#.cache/}" &&
   -f "${seed_compiler}" ]] || stop "the seed compiler is not pinned to this release's asset (docs/sources.md)"

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
    digest="$(set +o pipefail; tail -c +$((offset + 1)) "${snapshot}" | head -c 16384 |
      awk '{ print } /-----END [A-Z ]*PRIVATE KEY-----/ { exit }' |
      sed -E '$ s/(-----END [A-Z ]*PRIVATE KEY-----).*/\1/' | sha256sum | cut -c1-64)"
    /usr/bin/grep -q "^${digest} " config/public-test-keys.txt ||
      stop "${snapshot} holds a private key at byte ${offset} that config/public-test-keys.txt does not list"
  done < <(/usr/bin/grep -a -b -o -E -- "${pem}" "${snapshot}" || true)
done

step "3 the site is sealed from ${commit:0:8}, accepted, and is ${version}"
node scripts/site-release.mjs verify "${domain}" . || stop "${domain} is not packaged from this tree: bash scripts/package-pages.sh RELEASES slopshare.dev"

step "3 the npm packages: packed from ${commit:0:8}, installed into an empty app and booted"
npm_dir="build/npm-${version}"
rm -rf -- "${npm_dir}"
node scripts/package-npm.mjs "${npm_dir}" > /dev/null
node test/npm-browser.mjs > /dev/null || stop "the npm packages do not boot: node test/npm-browser.mjs"

step "6 the deployment: every published version and ${version}"
deployment="build/pages-${version}"
rm -rf -- "${deployment}"
node scripts/export-cloudflare-pages.mjs "${archive}" "${deployment}" "${domain}"
[[ -d "${deployment}/${version}" ]] || stop "the domain site is not ${version}"
versions="$(cd "${deployment}" && echo v*)"

cat <<COMMANDS
== checked at ${commit}: deployment $(find "${deployment}" -type f | wc -l) files.
   Nothing was tagged, pushed, uploaded or deployed. The owner runs:
4  git tag -a ${version} -m "Dolly ${version#v}" ${commit}
   git push origin main ${version}
5  gh release create ${version} ${seed_compiler} --verify-tag --notes-file NOTES
   for tarball in ${npm_dir}/*.tgz; do npm publish "\${tarball}" --access public; done
6  node test/pages-host.mjs ${deployment} 8790, and while it serves:
   node scripts/published-version.mjs boot http://127.0.0.1:8790 ${versions}
   systemd-run --user --unit dolly-deploy-${version} --working-directory=${project_dir} --setenv=PATH="\$PATH" bash -c 'npx wrangler@4.129.1 pages deploy ${project_dir}/${deployment} --project-name dolly --branch main > ${project_dir}/build/deploy-${version}.log 2>&1'
   (detached: an interrupted upload keeps nothing, so never restart it)
7  node scripts/published-version.mjs verify https://slopshare.dev ${deployment} ${version}
   node scripts/published-version.mjs boot https://slopshare.dev ${versions}
   node scripts/published-version.mjs boot https://daugasauron.com ${versions}
8  mv ${deployment}/${version} ${archive}/ && rm -rf ${deployment}
   then move package.json and src/version.mjs to the next version
   ${version}'s list, for the release notes: $(sha256sum "${deployment}/${version}/deployment.sha256" | cut -d' ' -f1)
COMMANDS
