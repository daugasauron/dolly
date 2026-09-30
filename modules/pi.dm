DOLLY 4
MODULE pi

COPY FROM HOST /Dollyfile-pi-build 6368594b9d6eff822dd0a1b9843d6847bdf955027df2652773f488569247cf98 /usr/bin/pi /usr/bin/pi
COPY FROM HOST /Dollyfile-pi-build 6368594b9d6eff822dd0a1b9843d6847bdf955027df2652773f488569247cf98 /usr/lib/pi /usr/lib/pi
COPY FROM HOST /Dollyfile-pi-build 6368594b9d6eff822dd0a1b9843d6847bdf955027df2652773f488569247cf98 /usr/lib/node_modules /usr/lib/node_modules
COPY FROM HOST /Dollyfile-pi-build 6368594b9d6eff822dd0a1b9843d6847bdf955027df2652773f488569247cf98 /usr/src/pi-source /usr/src/pi-source
COPY FROM HOST /Dollyfile-pi-build 6368594b9d6eff822dd0a1b9843d6847bdf955027df2652773f488569247cf98 /usr/share/licenses/pi-source/LICENSE /usr/share/licenses/pi-source/LICENSE

SOURCE HOST /static/default/pi/dolly-tools.js                    /home/dolly/.pi/agent/extensions/dolly-tools.js dcfb60bd010d479c40bd4ad0f91111bc5d3e928794be3eceadd7e516c0e5981f
SOURCE HOST /static/default/pi/SYSTEM.md                         /home/dolly/.pi/agent/SYSTEM.md                 34ef04d9e0414c95c672b3d9f933a74de0ddad9dba352030b5af842df3820d32
SOURCE HOST /static/default/pi/settings.json                     /home/dolly/.pi/agent/settings.json             26df82e404bbee8f70c40b9ac275eb76a577120c96f2e70fa3f4ed41917814b7
SOURCE HOST /static/default/pi/dolly-theme.json                  /home/dolly/.pi/agent/themes/dolly.json         ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297
SOURCE HOST /static/default/pi/dolly-skill.md                    /home/dolly/.pi/agent/skills/dolly/SKILL.md     860bf06d7a7bb4d7cc3bd40e9f30893f1e88dba5d3a1b89eb35549e17bb673e9

EXPORTS ENV PI_PACKAGE_DIR /usr/lib/node_modules/@earendil-works/pi-coding-agent
EXPORTS ENV PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi
FOLDER /home/dolly/.pi/agent

SLOP pi --version
