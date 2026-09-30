DOLLY 4
MODULE dollyfile

REQUIRES TOOL cc
REQUIRES TOOL tar

SOURCE HOST /static/default/dollyfile-source.tar /tmp/dollyfile-source.tar 2b09942deed5106005647c06547c4a0597375a94b04912cb5173a77cb7d9c9bf
SLOP tar -xf /tmp/dollyfile-source.tar -C /
SLOP cc -O1 /usr/src/dolly/dollyfile.c -o /bin/dollyfile

EXPORTS TOOL dollyfile
EXPORTS FOLDER dollyfile-source /usr/src/dolly
