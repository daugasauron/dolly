DOLLY 6
MODULE rust-sdk

REQUIRES HOST threads@0

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES TOOL gzip
REQUIRES TOOL cp
REQUIRES TOOL rm
REQUIRES TOOL mkdir

# External compiler/std seed; the linker adapter is compiled inside Dolly.
SOURCE https://daugasauron.com/dist/static/rust/rust-sdk.tar.gz 439c4ed88976294152f0d26b6204b0bc6a983d60c5d397f19d73004fdae4d44c /tmp/rust-sdk.tar.gz
SLOP mkdir -p /opt
SLOP gzip -dc /tmp/rust-sdk.tar.gz | tar -xf - -C /opt
SOURCE https://daugasauron.com/dist/static/rust/rustc.sh 966c3a6e1863196ca1d44b47552c46bc0e7caa8f096ef385252b3216f2f658d1 /opt/rust-sdk/bin/rustc
SOURCE https://daugasauron.com/dist/static/rust/rust-linker.c 455c8b6df47d3e8ff0d9eb70bd355a2b6bb2feb4615d5ed3ed58f69429ca46ee /tmp/rust-linker.c
SLOP cc -O1 /tmp/rust-linker.c -o /opt/rust-sdk/bin/dolly-rust-link
SLOP mkdir -p /usr/share/licenses/rust
SLOP cp -R /opt/rust-sdk/licenses/. /usr/share/licenses/rust
SLOP rm /tmp/rust-sdk.tar.gz /tmp/rust-linker.c

EXPORTS ENV PATH APPEND /opt/rust-sdk/bin
EXPORTS TOOL rustc
EXPORTS FOLDER rust-sdk /opt/rust-sdk
EXPORTS FOLDER rust-licenses /usr/share/licenses/rust
SLOP rustc --version --verbose
