# Sourced by scripts/prepare-image-sources.sh.
if has_module dollyfile-studio; then
  node scripts/build-source-tar.mjs "${static_dir}/studio/studio.tar" \
    demos/studio/examples /usr/share/dollyfile-studio/examples \
    demos/studio/install.slop /usr/share/dollyfile-studio/install.slop \
    demos/studio/lint.mjs /usr/share/dollyfile-studio/lint.mjs \
    demos/studio/build.mjs /usr/share/dollyfile-studio/build.mjs \
    src/dollyfile-view.mjs /usr/share/dollyfile-studio/parser.mjs \
    src/host/requirements.mjs /usr/share/dollyfile-studio/host/requirements.mjs \
    src/host/abi.mjs /usr/share/dollyfile-studio/host/abi.mjs \
    docs/dollyfile.md /usr/share/dollyfile-studio/dollyfile.md \
    docs/image-build-service.md /usr/share/dollyfile-studio/build-service.md \
    demos/studio/dollyfile-lint /usr/bin/dollyfile-lint \
    demos/studio/dollyfile-build /usr/bin/dollyfile-build \
    demos/studio/nvim /home/dolly/.config/nvim \
    demos/studio/pi-extension.js /home/dolly/.pi/agent/extensions/dollyfile-studio.js \
    demos/studio/prompts /home/dolly/.pi/agent/prompts \
    demos/studio/skills/dollyfiles /home/dolly/.pi/agent/skills/dollyfiles
fi
