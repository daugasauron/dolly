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

SOURCE HOST /static/classicube/source.tar.gz /tmp/classicube/source.tar.gz eb8fa195615a53176e0605dd8374b439c9574aac185513de5e3efe418c3f9024
SLOP gzip -dc /tmp/classicube/source.tar.gz | tar -xf - -C /
SLOP make -f /usr/src/dolly/classicube/Makefile

EXPORTS TOOL classicube
EXPORTS FOLDER classicube-data /usr/share/classicube
EXPORTS FOLDER classicube-source /usr/src/classicube
EXPORTS FOLDER classicube-port /usr/src/dolly/classicube
FILE /usr/share/licenses/classicube/license.txt
SLOP rm -rf /tmp/classicube
