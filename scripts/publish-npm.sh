#!/usr/bin/env bash
# The release's npm step (docs/deployment.md, step 5): publishes the tarballs the release
# checklist packed into DIR and tested, in DIR.order's order, each after those it depends on, and
# skips a package already at the version; then checks that the registry holds exactly these bytes.
#   bash scripts/publish-npm.sh build/npm-vX.Y.Z
# npm refuses this account's bypass-2FA tokens (npm/cli#9268): it signs in, and approves each
# publish, in a browser (--auth-type=web), so run it in a terminal. Run again, it resumes; with
# every package published it only checks them.
set -euo pipefail

dir="${1:?usage: publish-npm.sh build/npm-vX.Y.Z}"
order="${dir}.order"
version="${dir##*/npm-v}"
mapfile -t tarballs < "${order}"
[[ "${#tarballs[@]}" == "$(compgen -G "${dir}/*.tgz" | wc -l)" ]] || { echo "${order} does not list every tarball of ${dir}" >&2; exit 1; }
registry=(--registry https://registry.npmjs.org/)
name() { tar -xzOf "$1" package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0)).name'; }
# npm's reads lag its writes by minutes: a package published moments ago can look absent.
published() { [[ "$(npm view "${registry[@]}" "$1@${version}" version 2>/dev/null || true)" == "${version}" ]]; }

missing=()
for tarball in "${tarballs[@]}"; do published "$(name "${tarball}")" || missing+=("${tarball}"); done
if (( ${#missing[@]} )); then
  # A sign-in of its own, which ends with this script.
  config="$(mktemp)"
  trap 'npm --userconfig "${config}" logout "${registry[@]}" > /dev/null 2>&1; rm -f -- "${config}"' EXIT
  npm=(npm --userconfig "${config}" "${registry[@]}" --auth-type=web)
  "${npm[@]}" login
  echo "publishing ${#missing[@]} of the ${#tarballs[@]} packages as $("${npm[@]}" whoami)"
  for tarball in "${missing[@]}"; do
    package="$(name "${tarball}")"
    "${npm[@]}" publish "${tarball}" --access public --loglevel warn && { echo "${package}: published"; continue; }
    sleep 60
    published "${package}" && { echo "${package}: published"; continue; }
    echo "${package}: npm refused it (above); running this again resumes" >&2
    exit 1
  done
fi

for tarball in "${tarballs[@]}"; do
  package="$(name "${tarball}")" remote=""
  expected="sha512-$(openssl dgst -sha512 -binary "${tarball}" | base64 -w0)"
  for _ in $(seq 40); do
    remote="$(npm view "${registry[@]}" "${package}@${version}" dist.integrity 2>/dev/null || true)"
    [[ -z "${remote}" ]] || break
    sleep 30
  done
  [[ "${remote}" == "${expected}" ]] || { echo "${package}@${version}: the registry does not hold the tested tarball" >&2; exit 1; }
done
echo "dolly: the registry holds every package of ${dir} at ${version}, byte for byte the tested tarball"
