DOLLY 3
MODULE fd

REQUIRES TOOL patti
REQUIRES TOOL tar
REQUIRES TOOL cp
REQUIRES TOOL mkdir
REQUIRES TOOL rm

# Archives contain upstream source and checksum-verified locked crate archives.
SOURCE HOST /static/rust/fd.tar /tmp/fd.tar a1282ebc9d7122f8df6cef3f98b64d949ed086698e14bef7cced4f7c680f8728
SLOP tar -xf /tmp/fd.tar -C /
SLOP patti build --offline --manifest-path /tmp/fd/source/Cargo.toml --bin fd --patch jiff=/tmp/fd/jiff-0.2.29 --patch nix@0.31.3=/tmp/fd/nix-0.31.3 --patch ignore=/tmp/fd/ignore-0.4.31 --patch libc=/opt/rust-sdk/src/libc --cache /tmp/fd/cache --target-dir /tmp/fd/build
SLOP cp /tmp/fd/build/fd /usr/bin/fd
SLOP mkdir -p /usr/share/licenses/fd /usr/share/dolly/builds
SLOP cp /tmp/fd/source/LICENSE-MIT /usr/share/licenses/fd/LICENSE-MIT
SLOP cp /tmp/fd/source/LICENSE-APACHE /usr/share/licenses/fd/LICENSE-APACHE
SLOP cp /tmp/fd/build/patti-build.json /usr/share/dolly/builds/fd.json
SLOP rm -rf /tmp/fd /tmp/fd.tar

EXPORTS TOOL fd
EXPORTS FOLDER fd-licenses /usr/share/licenses/fd
FILE /usr/share/dolly/builds/fd.json
SLOP fd --version
