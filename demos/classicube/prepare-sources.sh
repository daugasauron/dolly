# Sourced by scripts/prepare-image-sources.sh.
if has_image classicube-build; then
  classicube_dir="$(bash demos/classicube/prepare-classicube.sh)"
  classicube_port_inputs=()
  for entry in Makefile config.h platform.c logger.c window.c input.c input.h http.c agent/control.h; do
    classicube_port_inputs+=("demos/classicube/${entry}" "/usr/src/dolly/classicube/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/classicube/source.tar.gz" \
    "${classicube_dir}/src" /usr/src/classicube/src \
    "${classicube_dir}/misc/sdl" /usr/src/classicube/misc/sdl \
    "${classicube_dir}/license.txt" /usr/src/classicube/license.txt \
    "${classicube_dir}/license.txt" /usr/share/licenses/classicube/license.txt \
    "${classicube_dir}/misc/cc_textures.zip" /usr/share/classicube/texpacks/default.zip \
    demos/game-agent/control.h /usr/src/dolly/game-agent/control.h \
    "${classicube_port_inputs[@]}"
fi
if has_image classicube; then
  classicube_agent_inputs=()
  for entry in COPYING auth.mjs control.h mission.mjs settings.mjs viewer.cpp; do
    classicube_agent_inputs+=("demos/game-agent/${entry}" "/usr/src/dolly/game-agent/${entry}")
  done
  for entry in player.js codec.mjs spectator/relay.mjs spectator/trace.mjs spectator/graphics.h; do
    classicube_agent_inputs+=("demos/rts/${entry}" "/usr/src/dolly/rts/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/classicube/agent.tar" \
    demos/classicube/agent /usr/src/dolly/classicube/agent \
    "${classicube_agent_inputs[@]}"
fi
