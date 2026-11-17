#!/usr/bin/env bash
# Go's source with the Dolly patch, cross-built for GOOS=dolly GOARCH=wasm64 on Linux x86_64 by
# upstream's toolchain of the same release, in build/go-port/go. rclone's staging lists the
# files its build compiles with the go command this leaves in bin. Its commands for
# dolly/wasm64, in build/go-port/go-seed.tar.gz, are how a bootstrap from nothing gets the first
# Go seed (README.md, "The seed").
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../.."
source config/source-pins.sh
port=build/go-port
input_key="$({
  printf '%s\n' dolly-go-port-1 "${DOLLY_GO_SHA256}" "${DOLLY_GO_HOST_SHA256}"
  sha256sum dist/dolly-process-abi.mjs host/http/abi.mjs demos/go/build-go-toolchain.sh demos/go/prepare-go-source.sh \
    "demos/go/go-${DOLLY_GO_VERSION}-dolly.patch"
} | sha256sum | cut -d' ' -f1)"
if [[ -f "${port}/port.inputs" && "$(cat "${port}/port.inputs")" == "${input_key}" ]]; then exit 0; fi
rm -rf "${port}"
mkdir -p "${port}/host"
tar -xzf "$(bash scripts/fetch-pinned-archive.sh go_host)" -C "${port}/host"
bash demos/go/prepare-go-source.sh "${port}"
(cd "${port}/go/src" && env -u GOROOT -u GOPATH GOTOOLCHAIN=local GOROOT_BOOTSTRAP="${PWD}/../../host/go" \
  GOOS=dolly GOARCH=wasm64 ./make.bash -no-banner)
root="${port}/go" generated=()
for file in cmd/cgo/zdefaultcc.go cmd/go/internal/cfg/zdefaultcc.go cmd/internal/objabi/zbootstrap.go \
    internal/buildcfg/zbootstrap.go internal/runtime/sys/zversion.go time/tzdata/zzipdata.go; do
  generated+=("${root}/src/${file}" "/usr/lib/go/src/${file}")
done
node scripts/build-source-tar.mjs "${port}/go-seed.tar.gz" "${root}/bin/dolly_wasm64" /usr/lib/go/bin \
  "${root}/pkg/tool/dolly_wasm64" /usr/lib/go/pkg/tool/dolly_wasm64 "${root}/pkg/include" /usr/lib/go/pkg/include "${generated[@]}"
printf '%s\n' "${input_key}" > "${port}/port.inputs"
echo "dolly: cross-built Go in ${port}/go"
