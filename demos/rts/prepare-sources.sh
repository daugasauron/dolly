# Sourced by scripts/prepare-image-sources.sh.
if has_image rts-build; then
  seven_kingdoms_dir="$(bash demos/rts/prepare-seven-kingdoms.sh)"
  rts_port_inputs=()
  for entry in Makefile config.h OAUDIO.h arena.cpp arena.h input.cpp input.h; do
    rts_port_inputs+=("demos/rts/${entry}" "/usr/src/dolly/rts/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/rts/seven-kingdoms.tar.gz" \
    "${seven_kingdoms_dir}/src" /usr/src/7kaa/src \
    "${seven_kingdoms_dir}/include" /usr/src/7kaa/include \
    "${seven_kingdoms_dir}/data" /usr/share/7kaa \
    "${seven_kingdoms_dir}/COPYING" /usr/share/licenses/7kaa/COPYING \
    "${seven_kingdoms_dir}/COPYING" /usr/src/7kaa/COPYING \
    "${rts_port_inputs[@]}"
fi
if has_image rts-arena; then
  node scripts/build-source-tar.mjs "${static_dir}/rts/arena.tar" \
    demos/rts/player.js /usr/src/dolly/rts/player.js \
    demos/rts/codec.mjs /usr/src/dolly/rts/codec.mjs \
    demos/rts/PLAYER.md /usr/src/dolly/rts/PLAYER.md \
    demos/rts/spectator /usr/src/dolly/rts/spectator \
    demos/rts/demo.tar.gz /tmp/rts-arena/demo.tar.gz
fi
