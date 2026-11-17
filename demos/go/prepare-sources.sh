# Sourced by scripts/prepare-image-sources.sh.
# The seed, Go's commands as the previous round built them, and the GOROOT's sources they
# build: the pinned release with the Dolly patch, as /usr/lib/go.
if has_image go-sdk; then
  node scripts/seed-archive.mjs stage DOLLY_GO_SEED "${static_dir}/go/go-seed.tar.gz"
  bash demos/go/prepare-go-source.sh "${staging}/go-source"
  go_root="${staging}/go-source/go"
  node scripts/build-source-tar.mjs "${static_dir}/go/go-source.tar.gz" \
    "${go_root}/VERSION" /usr/lib/go/VERSION "${go_root}/go.env" /usr/lib/go/go.env \
    "${go_root}/LICENSE" /usr/lib/go/LICENSE "${go_root}/PATENTS" /usr/lib/go/PATENTS \
    "${go_root}/src" /usr/lib/go/src "${go_root}/lib" /usr/lib/go/lib
fi
# A Go program's pinned release with its modules vendored (go mod vendor, which
# checks each against the release's go.sum), by upstream's linux/amd64 toolchain:
# the named members and vendor, as /tmp/NAME.
stage_go_program() {
  local name="$1" source directory="${staging}/go-$1" member members=()
  shift
  if [[ ! -x "${staging}/go-host/go/bin/go" ]]; then
    mkdir -p "${staging}/go-host"
    tar -xzf "$(bash scripts/fetch-pinned-archive.sh go_host)" -C "${staging}/go-host"
  fi
  source="$(bash scripts/fetch-pinned-archive.sh "${name}")"
  mkdir -p "${directory}/source" "${directory}/modules"
  tar -xzf "${source}" --strip-components=1 -C "${directory}/source"
  (cd "${directory}/source" && env -i PATH=/usr/bin:/bin HOME="${directory}" GOTOOLCHAIN=local GOFLAGS='-mod=mod -modcacherw' \
    GOMODCACHE="${directory}/modules" GOCACHE="${directory}/cache" "${staging}/go-host/go/bin/go" mod vendor)
  for member in "$@" vendor; do members+=("${directory}/source/${member}" "/tmp/${name}/${member}"); done
  node scripts/build-source-tar.mjs "${static_dir}/go/${name}.tar" "${members[@]}"
}
if has_image esbuild; then stage_go_program esbuild cmd internal pkg go.mod go.sum LICENSE.md; fi
