DOLLY 2
MODULE pi

# Pi 0.84.4 is compiled from its pinned upstream TypeScript workspace inside
# Dolly. Only generated model data and the finite locked external dependency
# graph come from the matching published packages.
REQUIRES HEADER libc
REQUIRES HEADER quickjs-runner
REQUIRES LIB    dolly-js
REQUIRES FOLDER typescript
REQUIRES TOOL   cc
REQUIRES TOOL   cp
REQUIRES TOOL   janis
REQUIRES TOOL   make
REQUIRES TOOL   mkdir
REQUIRES TOOL   qjs
REQUIRES TOOL   rm
REQUIRES TOOL   tar
REQUIRES TOOL   tsc

SOURCE HOST /static/default/pi-source.tar                        /tmp/pi/pi-source.tar                           c7e82ac2efc5714a7ea229a2ca42f05d584364af9769c0ac33d8a64ee603912f
SOURCE HOST /static/default/pi-generated-model-data.tar          /tmp/pi/pi-generated-model-data.tar             46d06b81f8ca1396981dc30c709aff2c702d83ca0d89ac0db5ebc95767ed22a6
SOURCE HOST /static/default/pi-runtime-packages.tar              /tmp/pi/pi-runtime-packages.tar                 e395b7d88cbcc3afa020437507b309cc37a6f0b0645e038842a304a6aa6d2998
SOURCE HOST /static/default/pi-tsconfig.dolly.json               /tmp/pi/tsconfig.dolly.json                     5b810ca0942889c635e7675a2945578d6d02d1be6dba98bb860269882d2ea825
SOURCE HOST /static/default/pi-quickjs-compat.mjs                /usr/lib/pi/quickjs-compat.mjs                  4bb0c0fc355abfd0a501378d6f5ad1342164c9014d807dd59b60c95861598f6a
SOURCE HOST /static/default/runtimes/apply-pi-quickjs-compat.mjs /usr/lib/pi/apply-pi-quickjs-compat.mjs         52b83033d7f25770bba0a0d6f27a1b265123add7561b0a141910d2a425deb298
SOURCE HOST /static/default/commands/pi.c                        /tmp/pi/pi.c                                    2296ec09e6b95b0d0dd065f806138e48eaad855d77d6366adfdfc33d720da98e
SOURCE HOST /static/default/pi/dolly-tools.js                    /home/dolly/.pi/agent/extensions/dolly-tools.js 02e61fcc3c7ad3f2ff5847acff5cd37320db2695e274aeb68414e00e247caf4d
SOURCE HOST /static/default/pi/SYSTEM.md                         /home/dolly/.pi/agent/SYSTEM.md                 9831e43c2edb91864c1c2d99b8c78a0b7f7d94682556f76bde638d8088647861
SOURCE HOST /static/default/pi/settings.json                     /home/dolly/.pi/agent/settings.json             965a08d704e4231103679addb1dc60d54f8173961c9b96371c72f563bb8ace82
SOURCE HOST /static/default/pi/dolly-theme.json                  /home/dolly/.pi/agent/themes/dolly.json         ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297
SOURCE HOST /static/default/pi/dolly-skill.md                    /home/dolly/.pi/agent/skills/dolly/SKILL.md     0599fb95cbf1b9420a52852b0fcbe31d8617235187053873f17f4a07bde95fc3

SLOP tar \
  -xf /tmp/pi/pi-source.tar \
  -C /
SLOP tar \
  -xf /tmp/pi/pi-generated-model-data.tar \
  -C /
SLOP tar \
  -xf /tmp/pi/pi-runtime-packages.tar \
  -C /

SLOP cp /tmp/pi/tsconfig.dolly.json /usr/src/pi-source/packages/telemetry/tsconfig.dolly.json
SLOP cp /tmp/pi/tsconfig.dolly.json /usr/src/pi-source/packages/ai/tsconfig.dolly.json
SLOP cp /tmp/pi/tsconfig.dolly.json /usr/src/pi-source/packages/agent/tsconfig.dolly.json
SLOP cp /tmp/pi/tsconfig.dolly.json /usr/src/pi-source/packages/protocol/tsconfig.dolly.json
SLOP cp /tmp/pi/tsconfig.dolly.json /usr/src/pi-source/packages/client/tsconfig.dolly.json
SLOP cp /tmp/pi/tsconfig.dolly.json /usr/src/pi-source/packages/tui/tsconfig.dolly.json
SLOP cp /tmp/pi/tsconfig.dolly.json /usr/src/pi-source/packages/coding-agent/tsconfig.dolly.json

# Execution is intentionally sequential: each workspace sees only output from
# earlier rows and no hidden host-side parallel build exists.
SLOP CWD /usr/src/pi-source/packages/telemetry tsc -p tsconfig.dolly.json --pretty false
SLOP CWD /usr/src/pi-source/packages/ai tsc -p tsconfig.dolly.json --pretty false
SLOP CWD /usr/src/pi-source/packages/agent tsc -p tsconfig.dolly.json --pretty false
SLOP CWD /usr/src/pi-source/packages/protocol tsc -p tsconfig.dolly.json --pretty false
SLOP CWD /usr/src/pi-source/packages/client tsc -p tsconfig.dolly.json --pretty false
SLOP CWD /usr/src/pi-source/packages/tui tsc -p tsconfig.dolly.json --pretty false
SLOP janis -m /usr/lib/pi/apply-pi-quickjs-compat.mjs /usr/src/pi-source/packages/tui/dist-dolly/utils.js
SLOP CWD /usr/src/pi-source/packages/coding-agent tsc -p tsconfig.dolly.json --pretty false

SLOP cp -r /usr/src/pi-source/packages/ai/src/providers/data /usr/src/pi-source/packages/ai/dist-dolly/providers
SLOP mkdir -p /usr/src/pi-source/packages/coding-agent/dist-dolly/core/export-html/vendor /usr/src/pi-source/packages/coding-agent/dist-dolly/modes/interactive/theme /usr/src/pi-source/packages/coding-agent/dist-dolly/modes/interactive/assets
SLOP cp /usr/src/pi-source/packages/coding-agent/src/core/export-html/template.html /usr/src/pi-source/packages/coding-agent/src/core/export-html/template.css /usr/src/pi-source/packages/coding-agent/src/core/export-html/template.js /usr/src/pi-source/packages/coding-agent/dist-dolly/core/export-html
SLOP cp /usr/src/pi-source/packages/coding-agent/src/core/export-html/vendor/marked.min.js /usr/src/pi-source/packages/coding-agent/src/core/export-html/vendor/highlight.min.js /usr/src/pi-source/packages/coding-agent/dist-dolly/core/export-html/vendor
SLOP cp /usr/src/pi-source/packages/coding-agent/src/modes/interactive/theme/dark.json /usr/src/pi-source/packages/coding-agent/src/modes/interactive/theme/light.json /usr/src/pi-source/packages/coding-agent/src/modes/interactive/theme/theme-schema.json /usr/src/pi-source/packages/coding-agent/dist-dolly/modes/interactive/theme
SLOP cp /usr/src/pi-source/packages/coding-agent/src/modes/interactive/assets/clankolas.png /usr/src/pi-source/packages/coding-agent/dist-dolly/modes/interactive/assets/clankolas.png

# Publish target-emitted workspaces at the conventional Janis package root.
SLOP mkdir -p /usr/lib/node_modules/@earendil-works/pi-telemetry /usr/lib/node_modules/@earendil-works/pi-ai /usr/lib/node_modules/@earendil-works/pi-agent-core /usr/lib/node_modules/@earendil-works/pi-protocol /usr/lib/node_modules/@earendil-works/pi-client /usr/lib/node_modules/@earendil-works/pi-tui /usr/lib/node_modules/@earendil-works/pi-coding-agent
SLOP cp /usr/src/pi-source/packages/telemetry/package.json /usr/lib/node_modules/@earendil-works/pi-telemetry/package.json
SLOP cp -r /usr/src/pi-source/packages/telemetry/dist-dolly /usr/lib/node_modules/@earendil-works/pi-telemetry/dist
SLOP cp /usr/src/pi-source/packages/ai/package.json /usr/lib/node_modules/@earendil-works/pi-ai/package.json
SLOP cp -r /usr/src/pi-source/packages/ai/dist-dolly /usr/lib/node_modules/@earendil-works/pi-ai/dist
SLOP cp /usr/src/pi-source/packages/agent/package.json /usr/lib/node_modules/@earendil-works/pi-agent-core/package.json
SLOP cp -r /usr/src/pi-source/packages/agent/dist-dolly /usr/lib/node_modules/@earendil-works/pi-agent-core/dist
SLOP cp /usr/src/pi-source/packages/protocol/package.json /usr/lib/node_modules/@earendil-works/pi-protocol/package.json
SLOP cp -r /usr/src/pi-source/packages/protocol/dist-dolly /usr/lib/node_modules/@earendil-works/pi-protocol/dist
SLOP cp /usr/src/pi-source/packages/client/package.json /usr/lib/node_modules/@earendil-works/pi-client/package.json
SLOP cp -r /usr/src/pi-source/packages/client/dist-dolly /usr/lib/node_modules/@earendil-works/pi-client/dist
SLOP cp /usr/src/pi-source/packages/tui/package.json /usr/lib/node_modules/@earendil-works/pi-tui/package.json
SLOP cp -r /usr/src/pi-source/packages/tui/dist-dolly /usr/lib/node_modules/@earendil-works/pi-tui/dist
SLOP cp /usr/src/pi-source/packages/coding-agent/package.json /usr/lib/node_modules/@earendil-works/pi-coding-agent/package.json
SLOP cp -r /usr/src/pi-source/packages/coding-agent/dist-dolly /usr/lib/node_modules/@earendil-works/pi-coding-agent/dist
SLOP cp /usr/src/pi-source/packages/coding-agent/README.md /usr/src/pi-source/packages/coding-agent/CHANGELOG.md /usr/lib/node_modules/@earendil-works/pi-coding-agent
SLOP cp -r /usr/src/pi-source/packages/coding-agent/docs /usr/src/pi-source/packages/coding-agent/examples /usr/lib/node_modules/@earendil-works/pi-coding-agent

FILE /tmp/pi/Makefile
    .RECIPEPREFIX := >
    CPPFLAGS := -std=gnu11 -I /usr/include/dolly -DEMSCRIPTEN=1 -D_GNU_SOURCE -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char -fdolly-runtime-interrupt-handler
    all: /usr/bin/pi
    /usr/bin/pi: /tmp/pi/pi.c /usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js
    >cc $(CPPFLAGS) $< -ldolly-js -o $@
SLOP make \
  -f /tmp/pi/Makefile

EXPORTS ENV  PI_PACKAGE_DIR        /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV  PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi

SLOP pi \
  --version

FOLDER /usr/lib/pi
FOLDER /usr/lib/node_modules
FOLDER /usr/src/pi-source
FOLDER /home/dolly/.pi/agent

SLOP rm \
  -rf \
  /tmp/pi
