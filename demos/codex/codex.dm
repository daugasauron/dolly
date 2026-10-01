DOLLY 6
MODULE codex

REQUIRES HOST threads@0

REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES TOOL cc
REQUIRES TOOL rm
REQUIRES TOOL sh

SOURCE https://daugasauron.com/dist/static/codex/launch.c 976af0443f20a29fb54d0e9b04d21138ba6d2fde269d2d6fd4a88b413ac9b04c /tmp/codex-launch.c
SOURCE https://daugasauron.com/dist/static/codex/config.toml 41195a65f4ae7b2502f30cf0ed938d0746954ed5434af4a2ef99ce0e05683c97 /usr/share/codex/config.toml
SLOP cc -O1 /tmp/codex-launch.c -o /usr/bin/codex
SLOP rm /tmp/codex-launch.c

EXPORTS TOOL codex
FILE /usr/libexec/codex
FILE /usr/share/codex/config.toml
