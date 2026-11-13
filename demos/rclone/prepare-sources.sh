# Sourced by scripts/prepare-image-sources.sh.
# rclone's release and the modules it vendors (upstream's archive of go mod
# vendor), with the Dolly patch and main, as /tmp/rclone: only the files its
# build for dolly/wasm64 compiles, which the seed's go lists, and each module's
# licence files under /usr/share/licenses/rclone.
if has_image rclone; then (
  shopt -s nullglob nocaseglob
  tree="${staging}/rclone"
  mkdir -p "${tree}/dolly"
  tar -xzf "$(bash scripts/fetch-pinned-archive.sh rclone)" --strip-components=1 -C "${tree}"
  tar -xzf "$(bash scripts/fetch-pinned-archive.sh rclone_vendor)" -C "${tree}"
  patch --batch --fuzz=0 --quiet -d "${tree}" -p1 < demos/rclone/rclone-1.76.0-dolly.patch
  cp demos/rclone/rclone.go "${tree}/dolly/rclone.go"
  go_list() {
    (cd "${tree}" && env -i PATH=/usr/bin:/bin HOME="${tree}" GOTOOLCHAIN=local GOFLAGS=-mod=vendor \
      GOCACHE="${staging}/rclone-cache" GOOS=dolly GOARCH=wasm64 "${project_dir}/build/go-port/go/bin/go" \
      list -deps -f "$1" ./dolly)
  }
  compiled="$(go_list '{{if not .Standard}}{{range .GoFiles}}{{$.Dir}}/{{.}}
{{end}}{{range .EmbedFiles}}{{$.Dir}}/{{.}}
{{end}}{{end}}')"
  modules="$(go_list '{{with .Module}}{{if not .Main}}{{.Path}}{{end}}{{end}}' | sort -u)"
  inputs=()
  for file in "${tree}/go.mod" "${tree}/vendor/modules.txt" ${compiled}; do
    inputs+=("${file}" "/tmp/rclone/${file#"${tree}/"}")
  done
  licences=/usr/share/licenses/rclone
  inputs+=("${tree}/COPYING" "${licences}/COPYING")
  for module in ${modules}; do
    files=("${tree}/vendor/${module}"/{licen[cs]e,copying,notice,patents}*)
    if (( ${#files[@]} == 0 )); then echo "dolly: rclone's module ${module} has no licence file" >&2; exit 1; fi
    for file in "${files[@]}"; do inputs+=("${file}" "${licences}/modules/${module}/${file##*/}"); done
  done
  node scripts/build-source-tar.mjs "${static_dir}/rclone/rclone.tar" "${inputs[@]}"
) fi
