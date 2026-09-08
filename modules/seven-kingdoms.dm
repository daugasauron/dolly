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

SOURCE HOST /static/rts/seven-kingdoms.tar /tmp/seven-kingdoms/source.tar bc32d9ccdd8c881270f8cb6a9e543f2b1f5047725f5f204cc0c2d24471e9952d
SLOP tar -xf /tmp/seven-kingdoms/source.tar -C /
SLOP make -f /usr/src/dolly/rts/Makefile

EXPORTS TOOL seven-kingdoms
EXPORTS FOLDER seven-kingdoms-data /usr/share/7kaa
EXPORTS FOLDER seven-kingdoms-source /usr/src/7kaa
EXPORTS FOLDER seven-kingdoms-port /usr/src/dolly/rts
FILE /usr/share/licenses/7kaa/COPYING
SLOP rm -rf /tmp/seven-kingdoms
