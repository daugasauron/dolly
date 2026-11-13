# Sourced by the scripts that prepare an upstream tree for the image build:
#   prepared_source NAME VERSION KEY FILE...
# The tree is build/generated/NAME-source-VERSION-HASH, HASH over KEY (the pins
# its preparation reads), FILE... and this file. When it is there, prints it and
# exits; otherwise sets output_dir and temporary, an empty sibling that the
# caller fills and publish_prepared_source renames into place in one operation.
prepared_source() {
  local name="$1" version="$2" key="$3" hash
  shift 3
  hash="$({ printf '%s\n' "${name}=${version}" "${key}"; sha256sum -- "$@" "${BASH_SOURCE[0]}" | awk '{print $1}'; } |
    sha256sum | awk '{print $1}')"
  output_dir="${project_dir}/build/generated/${name}-source-${version}-${hash:0:16}"
  if [[ -d "${output_dir}" ]]; then
    printf '%s\n' "${output_dir}"
    exit 0
  fi
  if [[ -e "${output_dir}" ]]; then
    echo "dolly: prepared ${name} output is not a directory: ${output_dir}" >&2
    exit 1
  fi
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.${name}-source.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
}

publish_prepared_source() {
  mv -T -- "${temporary}" "${output_dir}"
  trap - EXIT
  printf '%s\n' "${output_dir}"
}
