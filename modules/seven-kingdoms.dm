DOLLY 3
MODULE seven-kingdoms

REQUIRES HEADER cpp
REQUIRES HEADER sdl2
REQUIRES HEADER zlib
REQUIRES HEADER zconf
REQUIRES LIB SDL2
REQUIRES LIB z
REQUIRES TOOL c++
REQUIRES TOOL make
REQUIRES TOOL mkdir
REQUIRES TOOL tar
REQUIRES TOOL gzip
REQUIRES TOOL rm

SOURCE HOST /static/rts/seven-kingdoms.tar.gz /tmp/seven-kingdoms/source.tar.gz 3aad67177fca52d82c53b9a1e4d80665e3b11457480ca434cb9c9294195b04d6
SLOP gzip -dc /tmp/seven-kingdoms/source.tar.gz | tar -xf - -C /
SLOP make -f /usr/src/dolly/rts/Makefile

EXPORTS TOOL seven-kingdoms
EXPORTS FOLDER seven-kingdoms-data /usr/share/7kaa
EXPORTS FOLDER seven-kingdoms-source /usr/src/7kaa
EXPORTS FOLDER seven-kingdoms-port /usr/src/dolly/rts
FILE /usr/share/licenses/7kaa/COPYING
SLOP rm -rf /tmp/seven-kingdoms
