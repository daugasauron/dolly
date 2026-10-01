DOLLY 5
MODULE rust-sdk

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES TOOL gzip
REQUIRES TOOL cp
REQUIRES TOOL rm
REQUIRES TOOL mkdir

# External compiler/std seed; the linker adapter is compiled inside Dolly.
SOURCE https://daugasauron.com/static/rust/rust-sdk.tar.gz f3a89cfcb67052bdec64c6b35a5656c27ff40b7f631c84ddc3c3bda59319d77f /tmp/rust-sdk.tar.gz
SLOP mkdir -p /opt
SLOP gzip -dc /tmp/rust-sdk.tar.gz | tar -xf - -C /opt
SOURCE https://daugasauron.com/static/rust/rustc.sh f171e7c11501b7986912973be16256016a5449b99848e732a0f97459ce29a11e /opt/rust-sdk/bin/rustc
SOURCE https://daugasauron.com/static/rust/rust-linker.c 4c5c48b482e26d8cc43546bc130fb1b7913678cfe88b7175dec3b085afd3367d /tmp/rust-linker.c
SLOP cc -O1 /tmp/rust-linker.c -o /opt/rust-sdk/bin/dolly-rust-link
SLOP mkdir -p /usr/share/licenses/rust
SLOP cp -R /opt/rust-sdk/licenses/. /usr/share/licenses/rust
SLOP rm /tmp/rust-sdk.tar.gz /tmp/rust-linker.c

EXPORTS ENV PATH APPEND /opt/rust-sdk/bin
EXPORTS TOOL rustc
EXPORTS FOLDER rust-sdk /opt/rust-sdk
EXPORTS FOLDER rust-licenses /usr/share/licenses/rust
SLOP rustc --version --verbose
