DOLLY 3
MODULE dollyfile

REQUIRES TOOL cc
REQUIRES TOOL tar

SOURCE HOST /static/default/dollyfile-source.tar /tmp/dollyfile-source.tar 9be770c33014605e22f154533f2116f76c6c9f36d52f9ac042b9686db8438d84
SLOP tar -xf /tmp/dollyfile-source.tar -C /
SLOP cc -O1 /usr/src/dolly/dollyfile.c -o /bin/dollyfile

EXPORTS TOOL dollyfile
EXPORTS FOLDER dollyfile-source /usr/src/dolly
