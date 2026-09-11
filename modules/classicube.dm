DOLLY 3
MODULE classicube

REQUIRES HEADER sdl2
REQUIRES LIB SDL2
REQUIRES TOOL cc
REQUIRES TOOL make
REQUIRES TOOL mkdir
REQUIRES TOOL tar
REQUIRES TOOL gzip
REQUIRES TOOL rm

SOURCE HOST /static/classicube/source.tar.gz /tmp/classicube/source.tar.gz d1424b1826501f3d9dd6412f839dd7aa4db3af295f096521804358d733f0aec2
SLOP gzip -dc /tmp/classicube/source.tar.gz | tar -xf - -C /
SLOP make -f /usr/src/dolly/classicube/Makefile

EXPORTS TOOL classicube
EXPORTS FOLDER classicube-data /usr/share/classicube
EXPORTS FOLDER classicube-source /usr/src/classicube
EXPORTS FOLDER classicube-port /usr/src/dolly/classicube
FILE /usr/src/dolly/game-agent/control.h
FILE /usr/share/licenses/classicube/license.txt
SLOP rm -rf /tmp/classicube
