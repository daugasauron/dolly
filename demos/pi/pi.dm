DOLLY 5
MODULE pi

USE https://daugasauron.com/modules/search-tools.dm 4bc781369ef095853031abc87c5696bedaa746e012eca177de6c14326625155e
EXPORTS TOOL rg
EXPORTS TOOL fd
COPY FROM https://daugasauron.com/Dollyfile-pi-build 74af56fa985d362655929b7e87c844a8d337501d053222a53af2a08cf00a0f0f /usr/bin/pi /usr/bin/pi
COPY FROM https://daugasauron.com/Dollyfile-pi-build 74af56fa985d362655929b7e87c844a8d337501d053222a53af2a08cf00a0f0f /usr/lib/node_modules /usr/lib/node_modules
COPY FROM https://daugasauron.com/Dollyfile-pi-build 74af56fa985d362655929b7e87c844a8d337501d053222a53af2a08cf00a0f0f /usr/src/pi-source /usr/src/pi-source
COPY FROM https://daugasauron.com/Dollyfile-pi-build 74af56fa985d362655929b7e87c844a8d337501d053222a53af2a08cf00a0f0f /usr/share/licenses/pi-source/LICENSE /usr/share/licenses/pi-source/LICENSE

SOURCE https://daugasauron.com/static/default/pi/dolly-tools.js                    edd123743a5a8fcc7ddb80d4c8dd57ba7f6159705eaac8cc07340034bd9b9a29 /home/dolly/.pi/agent/extensions/dolly-tools.js
SOURCE https://daugasauron.com/static/default/pi/SYSTEM.md                         bfd8505b6f40533d9d5a19101a4bd62c9447d55e707f50aabbd22f1f2dbbe92e /home/dolly/.pi/agent/SYSTEM.md
SOURCE https://daugasauron.com/static/default/pi/settings.json                     26df82e404bbee8f70c40b9ac275eb76a577120c96f2e70fa3f4ed41917814b7 /home/dolly/.pi/agent/settings.json
SOURCE https://daugasauron.com/static/default/pi/dolly-theme.json                  ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297 /home/dolly/.pi/agent/themes/dolly.json
SOURCE https://daugasauron.com/static/default/pi/dolly-skill.md                    e62f67c85aa030b6159cf0c3fc6826c0bf65b50e9b2fdddedd04199640ddf18d /home/dolly/.pi/agent/skills/dolly/SKILL.md

EXPORTS ENV PI_PACKAGE_DIR /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi
FOLDER /home/dolly/.pi/agent

SLOP pi --version
