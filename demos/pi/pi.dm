DOLLY 4
MODULE pi

USE HOST /modules/search-tools.dm db934a88d3f978d94a486ff688481a556e4af8e01890fc5186713edb0d80dc58
EXPORTS TOOL rg
EXPORTS TOOL fd
COPY FROM HOST /Dollyfile-pi-build 0de87642d2270c612af51ecc9973e0320df1ba2b591ea2711c9c37d6a1ae6bae /usr/bin/pi /usr/bin/pi
COPY FROM HOST /Dollyfile-pi-build 0de87642d2270c612af51ecc9973e0320df1ba2b591ea2711c9c37d6a1ae6bae /usr/lib/node_modules /usr/lib/node_modules
COPY FROM HOST /Dollyfile-pi-build 0de87642d2270c612af51ecc9973e0320df1ba2b591ea2711c9c37d6a1ae6bae /usr/src/pi-source /usr/src/pi-source
COPY FROM HOST /Dollyfile-pi-build 0de87642d2270c612af51ecc9973e0320df1ba2b591ea2711c9c37d6a1ae6bae /usr/share/licenses/pi-source/LICENSE /usr/share/licenses/pi-source/LICENSE

SOURCE HOST /static/default/pi/dolly-tools.js                    /home/dolly/.pi/agent/extensions/dolly-tools.js edd123743a5a8fcc7ddb80d4c8dd57ba7f6159705eaac8cc07340034bd9b9a29
SOURCE HOST /static/default/pi/SYSTEM.md                         /home/dolly/.pi/agent/SYSTEM.md                 bfd8505b6f40533d9d5a19101a4bd62c9447d55e707f50aabbd22f1f2dbbe92e
SOURCE HOST /static/default/pi/settings.json                     /home/dolly/.pi/agent/settings.json             26df82e404bbee8f70c40b9ac275eb76a577120c96f2e70fa3f4ed41917814b7
SOURCE HOST /static/default/pi/dolly-theme.json                  /home/dolly/.pi/agent/themes/dolly.json         ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297
SOURCE HOST /static/default/pi/dolly-skill.md                    /home/dolly/.pi/agent/skills/dolly/SKILL.md     00660092534b146b46d850a8cd8c2d448e7dec09e76a0e1e19ac62a55c47313c

EXPORTS ENV PI_PACKAGE_DIR /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi
FOLDER /home/dolly/.pi/agent

SLOP pi --version
