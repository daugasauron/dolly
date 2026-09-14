DOLLY 3
MODULE dollyfile

REQUIRES TOOL cc
REQUIRES TOOL tar

SOURCE HOST /static/default/dollyfile-source.tar /tmp/dollyfile-source.tar 5b65bce7881a3ab49522290d1cd26737e213505fb5d3f446df562d2b250070d8
SLOP tar -xf /tmp/dollyfile-source.tar -C /
SLOP cc -O1 /usr/src/dolly/dollyfile.c -o /bin/dollyfile

EXPORTS TOOL dollyfile
EXPORTS FOLDER dollyfile-source /usr/src/dolly
