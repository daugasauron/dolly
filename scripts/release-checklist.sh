#!/usr/bin/env bash
# The release checklist of docs/deployment.md, as far as a script can check it,
# for the two sites packaged from HEAD:
#   scripts/release-checklist.sh DOMAIN_RELEASES GITHUB_RELEASES [ARCHIVE]
# It verifies, runs the Pages workflow's steps and assembles the deployment.
# It never tags, pushes, uploads or deploys: it ends by printing the commands
# that do, for the owner to run.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# -ge 2 ]] || { echo "usage: release-checklist.sh DOMAIN_RELEASES GITHUB_RELEASES [ARCHIVE]" >&2; exit 64; }
domain="$(realpath -- "$1")/current"
github="$(realpath -- "$2")/current"
archive="$(realpath -- "${3:-${project_dir}/published}")"
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

step "2 no token-shaped string in the unpushed commits or the image snapshots"
tokens='sk-ant-[A-Za-z0-9_-]{20,}|sk-or-v1-[0-9a-f]{32,}|sk-proj-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
git rev-parse -q --verify origin/main > /dev/null || stop "origin/main is unknown, so nothing says which commits a push would publish"
compgen -G "dist/dolly-*-system.snapshot" > /dev/null || stop "dist/ holds no image snapshot"
# Test fixtures say what they are: not-a-real-key.
found="$({ git log -p origin/main..HEAD; cat dist/dolly-*-system.snapshot; } | { /usr/bin/grep -a -o -E "${tokens}" || true; } |
  { /usr/bin/grep -v not-a-real-key || true; } | cut -c1-12 | sort -u)"
[[ -z "${found}" ]] || stop "token-shaped strings begin: ${found//$'\n'/ }"

step "3 both sites are sealed from ${commit:0:8}, accepted, and are ${version}"
for site in "${domain}" "${github}"; do
  node scripts/site-release.mjs verify "${site}" . || stop "${site} is not packaged from this tree: bash scripts/package-pages.sh RELEASES daugasauron.com|github-pages"
done

step "3 the Pages workflow's steps: export, under 1 GB"
static="$(mktemp -d build/github-static-XXXXXX)"
node scripts/export-static.mjs "${github}" "${static}/site"
[[ -f "${static}/site/${version}/index.html" ]] || stop "the GitHub Pages site is not ${version}"
github_bytes="$(du -sb "${static}/site" | cut -f1)"
rm -rf -- "${static}"
(( github_bytes <= 1000000000 )) || stop "the GitHub Pages site is ${github_bytes} bytes, over 1 GB"
tar -C "${github}" -czf build/dolly-pages.tar.gz .
tarball_sha256="$(sha256sum build/dolly-pages.tar.gz | cut -d' ' -f1)"

step "6 the deployment: every published version and ${version}"
deployment="build/pages-${version}"
rm -rf -- "${deployment}"
node scripts/export-cloudflare-pages.mjs "${archive}" "${deployment}" "${domain}"
[[ -d "${deployment}/${version}" ]] || stop "the domain site is not ${version}"
versions="$(cd "${deployment}" && echo v*)"

cat <<COMMANDS
== checked at ${commit}: GitHub Pages ${github_bytes} bytes, deployment $(find "${deployment}" -type f | wc -l) files.
   Nothing was tagged, pushed, uploaded or deployed. The owner runs:
4  git tag -a ${version} -m "Dolly ${version#v}" ${commit}
   git push origin main ${version}
5  gh release create ${version} build/dolly-pages.tar.gz --verify-tag --notes-file NOTES
   gh workflow run pages.yml -f release_tag=${version} -f artifact_sha256=${tarball_sha256}
6  systemd-run --user --unit dolly-deploy-${version} bash -c 'npx wrangler@4.129.1 pages deploy ${project_dir}/${deployment} --project-name dolly --branch main > ${project_dir}/build/deploy-${version}.log 2>&1'
   (detached: an interrupted upload keeps nothing, so never restart it)
7  node scripts/published-version.mjs verify https://daugasauron.com ${deployment} ${version}
   node scripts/published-version.mjs boot https://daugasauron.com ${versions}
   node scripts/published-version.mjs boot https://daugasauron.github.io/dolly ${version}
8  mv ${deployment}/${version} ${archive}/ && rm -rf ${deployment}
   then move package.json and src/version.mjs to the next version
   ${version}'s list, for the release notes: $(sha256sum "${deployment}/${version}/deployment.sha256" | cut -d' ' -f1)
COMMANDS
