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
REQUIRES TOOL rm

SOURCE HOST /static/rts/seven-kingdoms.tar /tmp/seven-kingdoms/source.tar 1a1b935e206316e4021f77244b817ac20f3ebd297100a0ce932c96205f8888b6
SLOP tar -xf /tmp/seven-kingdoms/source.tar -C /
SLOP make -f /usr/src/dolly/rts/Makefile

EXPORTS TOOL seven-kingdoms
EXPORTS FOLDER seven-kingdoms-data /usr/share/7kaa
EXPORTS FOLDER seven-kingdoms-source /usr/src/7kaa
EXPORTS FOLDER seven-kingdoms-port /usr/src/dolly/rts
FILE /usr/share/licenses/7kaa/COPYING
SLOP rm -rf /tmp/seven-kingdoms
