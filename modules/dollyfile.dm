DOLLY 4
MODULE dollyfile

REQUIRES TOOL cc
REQUIRES TOOL tar

SOURCE HOST /static/default/dollyfile-source.tar /tmp/dollyfile-source.tar 0a43c714991585aee690e93628c74703ab2c88abdef2b6fa13cbfcbc5a538058
SLOP tar -xf /tmp/dollyfile-source.tar -C /
SLOP cc -O1 /usr/src/dolly/dollyfile.c -o /bin/dollyfile

EXPORTS TOOL dollyfile
EXPORTS FOLDER dollyfile-source /usr/src/dolly
