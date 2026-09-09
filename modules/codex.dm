DOLLY 3
MODULE codex

REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES TOOL cc
REQUIRES TOOL rm
REQUIRES TOOL sh

SOURCE HOST /static/codex/launch.c /tmp/codex-launch.c 976af0443f20a29fb54d0e9b04d21138ba6d2fde269d2d6fd4a88b413ac9b04c
SOURCE HOST /static/codex/config.toml /usr/share/codex/config.toml 210a80320d637202714bb8429a3f30364621053add4f70df395b2f3d282439e6
SLOP cc -O1 /tmp/codex-launch.c -o /usr/bin/codex
SLOP rm /tmp/codex-launch.c

EXPORTS TOOL codex
FILE /usr/libexec/codex
FILE /usr/share/codex/config.toml
