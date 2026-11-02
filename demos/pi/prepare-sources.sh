# Sourced by scripts/prepare-image-sources.sh.
if has_image pi; then
  copy_static demos/pi/pi.c default/commands/pi.c
  node scripts/build-source-tar.mjs "${static_dir}/default/pi-npm.tar" "$(node demos/pi/prepare-pi-npm.mjs)" /tmp/pi-npm
fi
if has_image pi-dolly; then
  copy_static demos/pi/dolly-tools.js default/pi/dolly-tools.js
  copy_static demos/pi/ask-user.js default/pi/ask-user.js
  copy_static demos/pi/SYSTEM.md default/pi/SYSTEM.md
  copy_static demos/pi/settings.json default/pi/settings.json
  copy_static demos/pi/dolly-theme.json default/pi/dolly-theme.json
  copy_static demos/pi/skills/dolly/SKILL.md default/pi/dolly-skill.md
fi
