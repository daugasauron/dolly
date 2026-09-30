# Sourced by scripts/prepare-image-sources.sh.
if has_module bhop; then
  bhop_inputs=()
  for entry in COPYING auth.mjs control.h mission.mjs settings.mjs viewer.cpp; do
    bhop_inputs+=("demos/game-agent/${entry}" "/usr/src/dolly/game-agent/${entry}")
  done
  for entry in spectator/relay.mjs spectator/trace.mjs spectator/graphics.h; do
    bhop_inputs+=("demos/rts/${entry}" "/usr/src/dolly/rts/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/bhop/source.tar" \
    demos/bhop/agent /usr/src/dolly/bhop/agent \
    "${bhop_inputs[@]}"
fi
