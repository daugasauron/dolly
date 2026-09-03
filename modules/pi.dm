DOLLY 2
MODULE pi

REQUIRES TOOL   cc
REQUIRES TOOL   git
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar
REQUIRES LIB    dolly-js
REQUIRES HEADER libc
REQUIRES HEADER quickjs-runner

SOURCE HOST /static/default/pi-package.tar      /tmp/pi-package.tar                             c692b78fe802b701fd70bdfa5669f61d23b7145447183e941c51515c15a2ff1c
SOURCE HOST /static/default/commands/pi.c       /usr/src/dolly/commands/pi.c                    1195d25b135a5ab1805a7b5143f02a4253006b2a0facbc9dea205f0df265a604
SOURCE HOST /static/default/pi/dolly-tools.js   /home/dolly/.pi/agent/extensions/dolly-tools.js 02e61fcc3c7ad3f2ff5847acff5cd37320db2695e274aeb68414e00e247caf4d
SOURCE HOST /static/default/pi/SYSTEM.md        /home/dolly/.pi/agent/SYSTEM.md                 23a34eab211ffb91542b58fb140b70334717d07670906b5b1322b12e0d735d14
SOURCE HOST /static/default/pi/settings.json    /home/dolly/.pi/agent/settings.json             8eec7cba932e37fa88091b195f372e6be0c80f6209683761fb59fd4524469c05
SOURCE HOST /static/default/pi/dolly-theme.json /home/dolly/.pi/agent/themes/dolly.json         ed4737d4339c7458fa46c6f351c8a619e762189c051206aef1a8840e1f288297
SOURCE HOST /static/default/pi/dolly-skill.md   /home/dolly/.pi/agent/skills/dolly/SKILL.md     0599fb95cbf1b9420a52852b0fcbe31d8617235187053873f17f4a07bde95fc3
SLOP tar \
  -xf /tmp/pi-package.tar \
  -C /

FILE /tmp/pi/Makefile
    .RECIPEPREFIX := >
    all: /usr/bin/pi
    /usr/bin/pi: /usr/src/dolly/commands/pi.c /usr/lib/pi/pi.js
    >cc \
    >  -std=gnu11 \
    >  -I /usr/include/dolly \
    >  -DEMSCRIPTEN=1 \
    >  -D_GNU_SOURCE \
    >  -DQUICKJS_NG_BUILD \
    >  -DNDEBUG \
    >  -funsigned-char \
    >  -fdolly-runtime-interrupt-handler \
    >  $< \
    >  -ldolly-js \
    >  -o $@
SLOP CWD /usr/lib/pi make \
  -f /tmp/pi/Makefile

EXPORTS ENV  PI_PACKAGE_DIR        /usr/lib/pi
EXPORTS ENV  PI_SKIP_VERSION_CHECK 1
EXPORTS TOOL pi

SLOP pi \
  --version

FOLDER /usr/lib/pi
FOLDER /home/dolly/.pi/agent

SLOP rm \
  -rf \
  /tmp/pi \
  /tmp/pi-package.tar \
  /usr/src/dolly/commands
