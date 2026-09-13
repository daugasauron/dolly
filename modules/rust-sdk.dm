DOLLY 3
MODULE rust-sdk

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES TOOL gzip
REQUIRES TOOL cp
REQUIRES TOOL rm
REQUIRES TOOL mkdir

# External compiler/std seed; the linker adapter is compiled inside Dolly.
SOURCE HOST /static/rust/rust-sdk.tar.gz /tmp/rust-sdk.tar.gz b0a7ae68348c4be55f63014a3321ac0b55464d73922848a03d1bdb06de1aa955
SLOP mkdir -p /opt
SLOP gzip -dc /tmp/rust-sdk.tar.gz | tar -xf - -C /opt
SOURCE HOST /static/rust/rustc.sh /opt/rust-sdk/bin/rustc f171e7c11501b7986912973be16256016a5449b99848e732a0f97459ce29a11e
SOURCE HOST /static/rust/rust-linker.c /tmp/rust-linker.c 4c5c48b482e26d8cc43546bc130fb1b7913678cfe88b7175dec3b085afd3367d
SLOP cc -O1 /tmp/rust-linker.c -o /opt/rust-sdk/bin/dolly-rust-link
SLOP mkdir -p /usr/share/licenses/rust
SLOP cp -R /opt/rust-sdk/licenses/. /usr/share/licenses/rust
SLOP rm /tmp/rust-sdk.tar.gz /tmp/rust-linker.c

EXPORTS ENV PATH APPEND /opt/rust-sdk/bin
EXPORTS TOOL rustc
EXPORTS FOLDER rust-sdk /opt/rust-sdk
EXPORTS FOLDER rust-licenses /usr/share/licenses/rust
SLOP rustc --version --verbose
