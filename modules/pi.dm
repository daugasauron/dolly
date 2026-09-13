DOLLY 3
MODULE pi

COPY FROM HOST /Dollyfile-pi-build 78c85bf5a4496af7de3448f9ce484df69b7043978534fed6b38d88f3ad6ff77e /usr/bin/pi /usr/bin/pi
COPY FROM HOST /Dollyfile-pi-build 78c85bf5a4496af7de3448f9ce484df69b7043978534fed6b38d88f3ad6ff77e /usr/lib/pi /usr/lib/pi
COPY FROM HOST /Dollyfile-pi-build 78c85bf5a4496af7de3448f9ce484df69b7043978534fed6b38d88f3ad6ff77e /usr/lib/node_modules /usr/lib/node_modules
COPY FROM HOST /Dollyfile-pi-build 78c85bf5a4496af7de3448f9ce484df69b7043978534fed6b38d88f3ad6ff77e /usr/src/pi-source /usr/src/pi-source
COPY FROM HOST /Dollyfile-pi-build 78c85bf5a4496af7de3448f9ce484df69b7043978534fed6b38d88f3ad6ff77e /usr/share/licenses/pi-source/LICENSE /usr/share/licenses/pi-source/LICENSE

SOURCE HOST /static/default/pi/dolly-tools.js                    /home/dolly/.pi/agent/extensions/dolly-tools.js adbf8cd461482b022dc01747a6f25d27a21905c804806b509ec6c7439d0d84ad
SOURCE HOST /static/default/pi/SYSTEM.md                         /home/dolly/.pi/agent/SYSTEM.md                 34ef04d9e0414c95c672b3d9f933a74de0ddad9dba352030b5af842df3820d32
SOURCE HOST /static/default/pi/settings.json                     /home/dolly/.pi/agent/settings.json             26df82e404bbee8f70c40b9ac275eb76a577120c96f2e70fa3f4ed41917814b7
SOURCE HOST /static/default/pi/dolly-theme.json                  /home/dolly/.pi/agent/themes/dolly.json         ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297
SOURCE HOST /static/default/pi/dolly-skill.md                    /home/dolly/.pi/agent/skills/dolly/SKILL.md     860bf06d7a7bb4d7cc3bd40e9f30893f1e88dba5d3a1b89eb35549e17bb673e9

EXPORTS ENV PI_PACKAGE_DIR /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi
FOLDER /home/dolly/.pi/agent

SLOP pi --version
