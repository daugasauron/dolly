DOLLY 5
MODULE pi

USE https://daugasauron.com/demos/rust/search-tools.dm d9959da2958c2073a638e7742afebc0013edc21bb0038ca6ad50152dbca1765f
EXPORTS TOOL rg
EXPORTS TOOL fd
COPY FROM https://daugasauron.com/demos/pi/Dollyfile-pi-build 51a3c1bc6933fd7fdf3dd80956bd3390f4f71d17007d397e0ccb09f1cfd888b5 /usr/bin/pi /usr/bin/pi
COPY FROM https://daugasauron.com/demos/pi/Dollyfile-pi-build 51a3c1bc6933fd7fdf3dd80956bd3390f4f71d17007d397e0ccb09f1cfd888b5 /usr/lib/node_modules /usr/lib/node_modules
COPY FROM https://daugasauron.com/demos/pi/Dollyfile-pi-build 51a3c1bc6933fd7fdf3dd80956bd3390f4f71d17007d397e0ccb09f1cfd888b5 /usr/src/pi-source /usr/src/pi-source
COPY FROM https://daugasauron.com/demos/pi/Dollyfile-pi-build 51a3c1bc6933fd7fdf3dd80956bd3390f4f71d17007d397e0ccb09f1cfd888b5 /usr/share/licenses/pi-source /usr/share/licenses/pi-source

SOURCE https://daugasauron.com/dist/static/default/pi/dolly-tools.js                    edd123743a5a8fcc7ddb80d4c8dd57ba7f6159705eaac8cc07340034bd9b9a29 /home/dolly/.pi/agent/extensions/dolly-tools.js
SOURCE https://daugasauron.com/dist/static/default/pi/SYSTEM.md                         bfd8505b6f40533d9d5a19101a4bd62c9447d55e707f50aabbd22f1f2dbbe92e /home/dolly/.pi/agent/SYSTEM.md
SOURCE https://daugasauron.com/dist/static/default/pi/settings.json                     26df82e404bbee8f70c40b9ac275eb76a577120c96f2e70fa3f4ed41917814b7 /home/dolly/.pi/agent/settings.json
SOURCE https://daugasauron.com/dist/static/default/pi/dolly-theme.json                  ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297 /home/dolly/.pi/agent/themes/dolly.json
SOURCE https://daugasauron.com/dist/static/default/pi/dolly-skill.md                    e62f67c85aa030b6159cf0c3fc6826c0bf65b50e9b2fdddedd04199640ddf18d /home/dolly/.pi/agent/skills/dolly/SKILL.md

EXPORTS ENV PI_PACKAGE_DIR /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi
FOLDER /home/dolly/.pi/agent

SLOP pi --version
