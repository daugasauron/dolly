# Sourced by scripts/prepare-image-sources.sh.
if has_module pi; then
  copy_static demos/pi/dolly-tools.js default/pi/dolly-tools.js
  copy_static demos/pi/SYSTEM.md default/pi/SYSTEM.md
  copy_static demos/pi/settings.json default/pi/settings.json
  copy_static demos/pi/dolly-theme.json default/pi/dolly-theme.json
  copy_static demos/pi/skills/dolly/SKILL.md default/pi/dolly-skill.md
fi
if has_module pi-build; then
  if [[ ! -f node_modules/@earendil-works/pi-ai/package.json ]]; then
    echo "dolly: run npm ci before building Pi images" >&2
    exit 1
  fi
  copy_static demos/pi/pi.c default/commands/pi.c
  copy_static demos/pi/pi-tsconfig.dolly.json default/pi-tsconfig.dolly.json
  copy_static demos/pi/pi-quickjs-compat.mjs default/pi-quickjs-compat.mjs
  pi_source_dir="$(scripts/fetch-pinned-checkout.sh pi-source)"
  node scripts/build-source-tar.mjs "${static_dir}/default/pi-source.tar" \
    "${pi_source_dir}/tsconfig.base.json" /usr/src/pi-source/tsconfig.base.json \
    "${pi_source_dir}/LICENSE" /usr/share/licenses/pi-source/LICENSE \
    "${pi_source_dir}/packages/telemetry/package.json" /usr/src/pi-source/packages/telemetry/package.json \
    "${pi_source_dir}/packages/telemetry/tsconfig.build.json" /usr/src/pi-source/packages/telemetry/tsconfig.build.json \
    "${pi_source_dir}/packages/telemetry/src" /usr/src/pi-source/packages/telemetry/src \
    "${pi_source_dir}/packages/ai/package.json" /usr/src/pi-source/packages/ai/package.json \
    "${pi_source_dir}/packages/ai/tsconfig.build.json" /usr/src/pi-source/packages/ai/tsconfig.build.json \
    "${pi_source_dir}/packages/ai/src" /usr/src/pi-source/packages/ai/src \
    "${pi_source_dir}/packages/agent/package.json" /usr/src/pi-source/packages/agent/package.json \
    "${pi_source_dir}/packages/agent/tsconfig.build.json" /usr/src/pi-source/packages/agent/tsconfig.build.json \
    "${pi_source_dir}/packages/agent/src" /usr/src/pi-source/packages/agent/src \
    "${pi_source_dir}/packages/protocol/package.json" /usr/src/pi-source/packages/protocol/package.json \
    "${pi_source_dir}/packages/protocol/tsconfig.build.json" /usr/src/pi-source/packages/protocol/tsconfig.build.json \
    "${pi_source_dir}/packages/protocol/src" /usr/src/pi-source/packages/protocol/src \
    "${pi_source_dir}/packages/client/package.json" /usr/src/pi-source/packages/client/package.json \
    "${pi_source_dir}/packages/client/tsconfig.build.json" /usr/src/pi-source/packages/client/tsconfig.build.json \
    "${pi_source_dir}/packages/client/src" /usr/src/pi-source/packages/client/src \
    "${pi_source_dir}/packages/tui/package.json" /usr/src/pi-source/packages/tui/package.json \
    "${pi_source_dir}/packages/tui/tsconfig.build.json" /usr/src/pi-source/packages/tui/tsconfig.build.json \
    "${pi_source_dir}/packages/tui/src" /usr/src/pi-source/packages/tui/src \
    "${pi_source_dir}/packages/coding-agent/package.json" /usr/src/pi-source/packages/coding-agent/package.json \
    "${pi_source_dir}/packages/coding-agent/tsconfig.build.json" /usr/src/pi-source/packages/coding-agent/tsconfig.build.json \
    "${pi_source_dir}/packages/coding-agent/src" /usr/src/pi-source/packages/coding-agent/src \
    "${pi_source_dir}/packages/coding-agent/README.md" /usr/src/pi-source/packages/coding-agent/README.md \
    "${pi_source_dir}/packages/coding-agent/CHANGELOG.md" /usr/src/pi-source/packages/coding-agent/CHANGELOG.md \
    "${pi_source_dir}/packages/coding-agent/docs" /usr/src/pi-source/packages/coding-agent/docs \
    "${pi_source_dir}/packages/coding-agent/examples" /usr/src/pi-source/packages/coding-agent/examples
  # The pinned Git source omits generated model data. Restore only that exact
  # published artifact before compiling the seven Pi workspaces in Dolly.
  node scripts/build-source-tar.mjs "${static_dir}/default/pi-generated-model-data.tar" \
    node_modules/@earendil-works/pi-ai/dist/providers/data \
    /usr/src/pi-source/packages/ai/src/providers/data
  node demos/pi/build-pi-runtime-packages.mjs "${static_dir}/default/pi-runtime-packages.tar"
fi
