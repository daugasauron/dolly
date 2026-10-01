DOLLY 5
MODULE patti

REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES HEADER zlib
REQUIRES LIB z
REQUIRES TOOL cc
REQUIRES TOOL curl
REQUIRES TOOL rustc
REQUIRES TOOL rm

SOURCE https://daugasauron.com/dist/static/patti/patti.c 5c670a4b979b44d082aed3e5f7a05ed2bd478d2e394d9e24f311c81779dadc4a /tmp/patti/patti.c
SOURCE https://daugasauron.com/dist/static/patti/sha256.h 4487133c310d06add786d59fc8baab82f9b26a28cf53f3a2afd972f2f10bd123 /tmp/patti/sha256.h
SOURCE https://daugasauron.com/dist/static/patti/tomlc17.c 89d3fe5ffe387360993c8b9df8f03eb13cd6df379b4482bcd039399f690a770f /tmp/patti/tomlc17.c
SOURCE https://daugasauron.com/dist/static/patti/tomlc17.h 281708fa05b805c32c117fc6033b0f4248257fce3440b1ac3391853bfc8f8bb5 /tmp/patti/tomlc17.h
SOURCE https://daugasauron.com/dist/static/patti/LICENSE f949d0976f85076c96fc5122f0632b5a1b806d8b2badbe968c42c97230e6e79e /usr/share/licenses/patti/tomlc17-LICENSE

SLOP cc -std=c17 -O1 -I /tmp/patti /tmp/patti/patti.c /tmp/patti/tomlc17.c -lz -o /usr/bin/patti
SLOP rm -rf /tmp/patti

EXPORTS TOOL patti
FILE /usr/share/licenses/patti/tomlc17-LICENSE
SLOP patti --help
