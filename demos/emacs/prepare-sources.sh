# Sourced by scripts/prepare-image-sources.sh.
if has_image emacs; then
  emacs_dir="$(bash demos/emacs/prepare-emacs.sh)"
  emacs_inputs=()
  for path in COPYING config.status configure.ac m4 admin build-aux etc info leim lib lib-src lisp lwlib src; do
    emacs_inputs+=("${emacs_dir}/${path}" "/tmp/emacs/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/emacs/emacs.tar.gz" "${emacs_inputs[@]}"
fi
