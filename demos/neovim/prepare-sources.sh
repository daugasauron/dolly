# Sourced by scripts/prepare-image-sources.sh.
if has_module lua; then
  lua_archive="$(bash scripts/fetch-pinned-archive.sh lua)"
fi
if has_module lpeg; then
  lpeg_dir="$(bash scripts/fetch-pinned-source.sh lpeg)"
fi
if has_module neovim || has_module neovim-parsers; then
  neovim_dir="$(bash demos/neovim/prepare-neovim.sh)"
fi
if has_module luv; then
  luv_dir="$(bash scripts/fetch-pinned-source.sh luv)"
  lua_compat53_dir="$(bash scripts/fetch-pinned-source.sh lua_compat53)"
fi
if has_module lua; then
  copy_static "${lua_archive}" neovim/lua-5.1.5.tar.gz
fi
if has_module lpeg; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/lpeg.tar" \
    "${lpeg_dir}" /tmp/lpeg/source \
    "${lpeg_dir}/lpeg.html" /usr/share/licenses/lpeg/lpeg.html
fi
if has_module luv; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/luv.tar" \
    "${luv_dir}" /tmp/luv/source \
    "${lua_compat53_dir}" /tmp/luv/source/deps/lua-compat-5.3 \
    "${luv_dir}/LICENSE.txt" /usr/share/licenses/luv/LICENSE.txt \
    "${lua_compat53_dir}/LICENSE" /usr/share/licenses/lua-compat53/LICENSE
fi
if has_module neovim; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/neovim.tar.gz" \
    "${neovim_dir}" /tmp/neovim/source \
    "${neovim_dir}/LICENSE.txt" /usr/share/licenses/neovim/LICENSE.txt \
    "${neovim_dir}/src/mpack/LICENSE-MIT" /usr/share/licenses/neovim/mpack \
    "${neovim_dir}/src/nvim/vterm/LICENSE" /usr/share/licenses/neovim/vterm
fi
if has_module neovim-parsers; then
  parser_inputs=()
  for language in c lua vim vimdoc query markdown; do
    parser_dir="$(bash scripts/fetch-pinned-source.sh "treesitter_${language}")"
    parser_target="/tmp/neovim-parsers/${language}"
    parser_license=LICENSE
    if [[ "${language}" == lua ]]; then parser_license=LICENSE.md; fi
    parser_inputs+=("${parser_dir}/${parser_license}" "/usr/share/licenses/neovim-parsers/${language}")
    parser_cmake=TreesitterParserCMakeLists.txt
    if [[ "${language}" == markdown ]]; then
      parser_cmake=MarkdownParserCMakeLists.txt
      for grammar in tree-sitter-markdown tree-sitter-markdown-inline; do
        parser_inputs+=("${parser_dir}/${grammar}/src" "${parser_target}/${grammar}/src")
      done
    else
      parser_inputs+=("${parser_dir}/src" "${parser_target}/src")
    fi
    parser_inputs+=("${neovim_dir}/cmake.deps/cmake/${parser_cmake}" "${parser_target}/CMakeLists.txt")
  done
  node scripts/build-source-tar.mjs "${static_dir}/neovim/parsers.tar" "${parser_inputs[@]}" \
    "${neovim_dir}/LICENSE.txt" /usr/share/licenses/neovim-parsers/build-recipes
fi
for dependency in utf8proc treesitter; do
  if has_module "${dependency}"; then
    dependency_dir="$(bash scripts/fetch-pinned-source.sh "${dependency}")"
    dependency_license=LICENSE
    if [[ "${dependency}" == utf8proc ]]; then dependency_license=LICENSE.md; fi
    node scripts/build-source-tar.mjs "${static_dir}/neovim/${dependency}.tar" \
      "${dependency_dir}" "/tmp/${dependency}/source" \
      "${dependency_dir}/${dependency_license}" "/usr/share/licenses/${dependency}/LICENSE"
  fi
done
