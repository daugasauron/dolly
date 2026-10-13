#!/usr/bin/env bash
# Prints the pinned toybox release with the headers its own scripts generate
# for the configuration below. Those scripts are bash and compile three small
# generators for the host, and Slop is not bash: this one step runs outside
# Dolly, as a configure script would. The C is compiled in Dolly, unchanged.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" toybox)"
recipe_hash="$(sha256sum "${BASH_SOURCE[0]}" | cut -c1-16)"
output="${project_dir}/build/generated/toybox-${DOLLY_TOYBOX_SHA256:0:16}-${recipe_hash}"
temporary=""
cleanup() {
  if [[ -n "${temporary}" ]]; then rm -rf -- "${temporary}"; fi
}
trap cleanup EXIT
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.toybox.XXXXXX")"
  tar -xzf "${archive}" --strip-components=1 -C "${temporary}"
  # grep and sed, with their help. No fork: toybox calls that NOMMU.
  printf '%s\n' CONFIG_GREP=y CONFIG_SED=y CONFIG_TOYBOX_HELP=y CONFIG_TOYBOX_HELP_DASHDASH=y \
    CONFIG_TOYBOX_FLOAT=y CONFIG_TOYBOX_FORCE_NOMMU=y > "${temporary}/dolly.config"
  (cd "${temporary}" && export LC_ALL=C && KCONFIG_ALLCONFIG=dolly.config scripts/genconfig.sh -n &&
    NOBUILD=1 scripts/make.sh) > /dev/null
  mv -T "${temporary}" "${output}"
  temporary=""
fi
printf '%s\n' "${output}"
