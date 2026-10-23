# Sourced by scripts/prepare-image-sources.sh.
if has_image ocaml; then
  # Configured and patched outside (prepare-ocaml.sh); Dolly builds it.
  ocaml_dir="$(bash demos/ocaml/prepare-ocaml.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/ocaml/ocaml.tar.gz" "${ocaml_dir}" /tmp/ocaml
fi
