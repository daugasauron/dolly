DOLLY 6
MODULE pi

USE https://daugasauron.com/demos/rust/search-tools.dm 5d23b1dfda0e91cc48a6f5f2a7a1dd6a484871417fd328362f4d151e1404ad51
EXPORTS TOOL rg
EXPORTS TOOL fd
COPY https://daugasauron.com/demos/pi/Dollyfile-pi-build 8e585e76b9553f4157f5b78250e1665f755cf89b9d21b27619908201ce398490 /usr/bin/pi /usr/bin/pi
COPY https://daugasauron.com/demos/pi/Dollyfile-pi-build 8e585e76b9553f4157f5b78250e1665f755cf89b9d21b27619908201ce398490 /usr/lib/node_modules /usr/lib/node_modules
COPY https://daugasauron.com/demos/pi/Dollyfile-pi-build 8e585e76b9553f4157f5b78250e1665f755cf89b9d21b27619908201ce398490 /usr/src/pi-source /usr/src/pi-source
COPY https://daugasauron.com/demos/pi/Dollyfile-pi-build 8e585e76b9553f4157f5b78250e1665f755cf89b9d21b27619908201ce398490 /usr/share/licenses/pi-source /usr/share/licenses/pi-source

SOURCE https://daugasauron.com/dist/static/default/pi/dolly-tools.js                    22d1cd0cd804ef22b7e73683a3c93e98cd99b574a12643bc6b240329da460d9a /home/dolly/.pi/agent/extensions/dolly-tools.js
SOURCE https://daugasauron.com/dist/static/default/pi/SYSTEM.md                         bfd8505b6f40533d9d5a19101a4bd62c9447d55e707f50aabbd22f1f2dbbe92e /home/dolly/.pi/agent/SYSTEM.md
SOURCE https://daugasauron.com/dist/static/default/pi/settings.json                     26df82e404bbee8f70c40b9ac275eb76a577120c96f2e70fa3f4ed41917814b7 /home/dolly/.pi/agent/settings.json
SOURCE https://daugasauron.com/dist/static/default/pi/dolly-theme.json                  ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297 /home/dolly/.pi/agent/themes/dolly.json
SOURCE https://daugasauron.com/dist/static/default/pi/dolly-skill.md                    e62f67c85aa030b6159cf0c3fc6826c0bf65b50e9b2fdddedd04199640ddf18d /home/dolly/.pi/agent/skills/dolly/SKILL.md

EXPORTS ENV PI_PACKAGE_DIR /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi
FILE /home/dolly/.pi/agent/extensions/dolly-tools.js
FILE /home/dolly/.pi/agent/SYSTEM.md
FILE /home/dolly/.pi/agent/settings.json
FILE /home/dolly/.pi/agent/themes/dolly.json
FILE /home/dolly/.pi/agent/skills/dolly/SKILL.md

SLOP pi --version
