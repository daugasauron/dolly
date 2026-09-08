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

SOURCE HOST /static/rts/seven-kingdoms.tar /tmp/seven-kingdoms/source.tar ff827274a757a565d998655ed64caa764cf396e8e896063ba955df97e7b4e062
SLOP tar -xf /tmp/seven-kingdoms/source.tar -C /
SLOP make -f /usr/src/dolly/rts/Makefile

EXPORTS TOOL seven-kingdoms
EXPORTS FOLDER seven-kingdoms-data /usr/share/7kaa
EXPORTS FOLDER seven-kingdoms-source /usr/src/7kaa
EXPORTS FOLDER seven-kingdoms-port /usr/src/dolly/rts
FILE /usr/share/licenses/7kaa/COPYING
SLOP rm -rf /tmp/seven-kingdoms
