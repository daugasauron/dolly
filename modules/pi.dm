DOLLY 4
MODULE pi

COPY FROM HOST /Dollyfile-pi-build d31de4553742485c7924f02def1748f3d68d5a9448040151cb975c83f88ba290 /usr/bin/pi /usr/bin/pi
COPY FROM HOST /Dollyfile-pi-build d31de4553742485c7924f02def1748f3d68d5a9448040151cb975c83f88ba290 /usr/lib/node_modules /usr/lib/node_modules
COPY FROM HOST /Dollyfile-pi-build d31de4553742485c7924f02def1748f3d68d5a9448040151cb975c83f88ba290 /usr/src/pi-source /usr/src/pi-source
COPY FROM HOST /Dollyfile-pi-build d31de4553742485c7924f02def1748f3d68d5a9448040151cb975c83f88ba290 /usr/share/licenses/pi-source/LICENSE /usr/share/licenses/pi-source/LICENSE

SOURCE HOST /static/default/pi/dolly-tools.js                    /home/dolly/.pi/agent/extensions/dolly-tools.js edd123743a5a8fcc7ddb80d4c8dd57ba7f6159705eaac8cc07340034bd9b9a29
SOURCE HOST /static/default/pi/SYSTEM.md                         /home/dolly/.pi/agent/SYSTEM.md                 bfd8505b6f40533d9d5a19101a4bd62c9447d55e707f50aabbd22f1f2dbbe92e
SOURCE HOST /static/default/pi/settings.json                     /home/dolly/.pi/agent/settings.json             26df82e404bbee8f70c40b9ac275eb76a577120c96f2e70fa3f4ed41917814b7
SOURCE HOST /static/default/pi/dolly-theme.json                  /home/dolly/.pi/agent/themes/dolly.json         ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297
SOURCE HOST /static/default/pi/dolly-skill.md                    /home/dolly/.pi/agent/skills/dolly/SKILL.md     860bf06d7a7bb4d7cc3bd40e9f30893f1e88dba5d3a1b89eb35549e17bb673e9

EXPORTS ENV PI_PACKAGE_DIR /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi
FOLDER /home/dolly/.pi/agent

SLOP pi --version
