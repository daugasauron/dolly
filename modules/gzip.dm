DOLLY 3
MODULE gzip

REQUIRES HEADER libc
REQUIRES HEADER zlib
REQUIRES LIB z
REQUIRES TOOL cc
REQUIRES TOOL rm

SOURCE HOST /static/default/commands/gzip.c /tmp/gzip.c dc8fddc876932984ede5bf89a12d4e071de2d8e361354df29fa31e9df5b36f7f
SLOP cc -std=c17 /tmp/gzip.c -lz -o /bin/gzip
SLOP rm /tmp/gzip.c
EXPORTS TOOL gzip
