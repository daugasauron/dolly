#!/usr/bin/env bash
# Ghostty at the pinned commit with the core's patch and the application's
# (ghostty-dolly.patch here), and the packages its build.zig.zon names,
# fetched into zig-pkg by the host's Zig 0.16 (a session reaches no network
# but the broker); libxev and translate-c are patched there. Prints the tree.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
demo_dir="${project_dir}/demos/ghostty-gtk"
source "${project_dir}/config/source-pins.sh"
checkout="$(bash "${project_dir}/scripts/fetch-pinned-checkout.sh" ghostty)"
recipe_hash="$(cd "${project_dir}" && sha256sum demos/ghostty-gtk/prepare-ghostty.sh config/ghostty-dolly.patch \
  demos/ghostty-gtk/ghostty-dolly.patch demos/ghostty-gtk/libxev-dolly.patch \
  demos/ghostty-gtk/translate-c-dolly.patch demos/ghostty-gtk/zig-packages.txt | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/ghostty-gtk-${DOLLY_GHOSTTY_COMMIT:0:16}-${recipe_hash}"
if [[ -d "${output}" ]]; then
  printf '%s\n' "${output}"
  exit 0
fi

zig_archive="$("${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_ZIG_HOST_URL}" "${DOLLY_ZIG_HOST_SHA256}" \
  "${project_dir}/.cache/zig-x86_64-linux-${DOLLY_ZIG_VERSION}.tar.xz")"
mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.ghostty-gtk.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
mkdir "${temporary}/zig" "${temporary}/tree"
tar -xJf "${zig_archive}" --strip-components=1 -C "${temporary}/zig"
# The checkout is shared: its files are copied, never written.
cp -a "${checkout}/." "${temporary}/tree/"
rm -rf "${temporary}/tree/.git"
tree="${temporary}/tree"
# The core's patch first, applied as for Dolly's terminal
# (scripts/prepare-ghostty-source.sh), then the application's.
patch --silent --no-backup-if-mismatch -d "${tree}" -p1 < "${project_dir}/config/ghostty-dolly.patch"
patch --silent --fuzz=0 --no-backup-if-mismatch -d "${tree}" -p1 < "${demo_dir}/ghostty-dolly.patch"
# Zig's resolver fails a lookup now and then (NameServerFailure); a fetch keeps
# what it has, so another attempt takes up the rest.
for attempt in 1 2 3 4 5; do
  (cd "${tree}" && ZIG_GLOBAL_CACHE_DIR="${temporary}/cache" "${temporary}/zig/zig" build --fetch=all) && break
  [[ "${attempt}" != 5 ]] || exit 1
done
# Of every package Zig fetched, those Dolly's build uses (zig-packages.txt):
# the rest serve other systems and front ends.
for package in "${tree}"/zig-pkg/*; do
  grep -qxF "$(basename "${package}")" "${demo_dir}/zig-packages.txt" || rm -rf "${package}"
done
while read -r package; do test -d "${tree}/zig-pkg/${package}"; done < "${demo_dir}/zig-packages.txt"
rm -rf "${tree}/macos" "${tree}/flatpak" "${tree}/snap" "${tree}/nix"
# Test data the build does not read, some with names too long for a source
# archive: Ghostty's fuzzing corpus and SPIRV-Cross's test shaders.
spirv_cross="${tree}/zig-pkg/N-V-__8AANb6pwD7O1WG6L5nvD_rNMvnSc9Cpg1ijSlTYywv"
rm -rf "${tree}/test/fuzz-libghostty" "${spirv_cross}/reference" "${spirv_cross}"/shaders*
# Source archives hold files only (the checkout links CLAUDE.md to AGENTS.md).
find "${tree}" -type l -delete
patch --silent --fuzz=0 --no-backup-if-mismatch -d "${tree}"/zig-pkg/libxev-* -p1 < "${demo_dir}/libxev-dolly.patch"
patch --silent --fuzz=0 --no-backup-if-mismatch -d "${tree}"/zig-pkg/translate_c-* -p1 < "${demo_dir}/translate-c-dolly.patch"

mv -T -- "${tree}" "${output}"
printf '%s\n' "${output}"
