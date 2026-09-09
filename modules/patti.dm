DOLLY 3
MODULE patti

REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES HEADER zlib
REQUIRES LIB z
REQUIRES TOOL cc
REQUIRES TOOL curl
REQUIRES TOOL rustc
REQUIRES TOOL rm

SOURCE HOST /static/patti/patti.c /tmp/patti/patti.c 4f956c1bb63f040fc8d7ed273a2aaa7a339b6625f6f2def4791877e04bf5e9c5
SOURCE HOST /static/patti/sha256.h /tmp/patti/sha256.h 4487133c310d06add786d59fc8baab82f9b26a28cf53f3a2afd972f2f10bd123
SOURCE HOST /static/patti/tomlc17.c /tmp/patti/tomlc17.c 89d3fe5ffe387360993c8b9df8f03eb13cd6df379b4482bcd039399f690a770f
SOURCE HOST /static/patti/tomlc17.h /tmp/patti/tomlc17.h 281708fa05b805c32c117fc6033b0f4248257fce3440b1ac3391853bfc8f8bb5
SOURCE HOST /static/patti/LICENSE /usr/share/licenses/patti/tomlc17-LICENSE f949d0976f85076c96fc5122f0632b5a1b806d8b2badbe968c42c97230e6e79e

SLOP cc -std=c17 -O1 -I /tmp/patti /tmp/patti/patti.c /tmp/patti/tomlc17.c -lz -o /usr/bin/patti
SLOP rm -rf /tmp/patti

EXPORTS TOOL patti
FILE /usr/share/licenses/patti/tomlc17-LICENSE
SLOP patti --help
