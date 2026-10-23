# Sourced by scripts/prepare-image-sources.sh.
if has_image go-sdk; then
  if ! (cd build/go-port 2> /dev/null && sha256sum --check --status seed.sha256); then
    echo 'dolly: no verified Go seed: run demos/go/build-go-toolchain.sh once, then retry the image build' >&2
    exit 1
  fi
  copy_static build/go-port/go-sdk.tar.gz go/go-sdk.tar.gz
fi
# A Go program's pinned release with its modules vendored (go mod vendor, which
# checks each against the release's go.sum), by upstream's toolchain that
# build-go-toolchain.sh extracted: the named members and vendor, as /tmp/NAME.
stage_go_program() {
  local name="$1" source directory="${staging}/go-$1" member members=()
  shift
  source="$(bash scripts/fetch-pinned-archive.sh "${name}")"
  mkdir -p "${directory}/source" "${directory}/modules"
  tar -xzf "${source}" --strip-components=1 -C "${directory}/source"
  (cd "${directory}/source" && env -i PATH=/usr/bin:/bin HOME="${directory}" GOTOOLCHAIN=local GOFLAGS='-mod=mod -modcacherw' \
    GOMODCACHE="${directory}/modules" GOCACHE="${directory}/cache" "${project_dir}/build/go-port/host/go/bin/go" mod vendor)
  for member in "$@" vendor; do members+=("${directory}/source/${member}" "/tmp/${name}/${member}"); done
  node scripts/build-source-tar.mjs "${static_dir}/go/${name}.tar" "${members[@]}"
}
if has_image esbuild; then stage_go_program esbuild cmd internal pkg go.mod go.sum LICENSE.md; fi
