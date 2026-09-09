DOLLY 3
MODULE protox

REQUIRES TOOL patti
REQUIRES TOOL tar
REQUIRES TOOL cp
REQUIRES TOOL mkdir
REQUIRES TOOL rm
REQUIRES TOOL test

# Archives contain upstream source and checksum-verified locked crate archives.
SOURCE HOST /static/rust/protox.tar /tmp/protox.tar 501305f0e373d0509dbd133368c7944dffa6f710a44ee514c06bdf357fa33bf6
SLOP tar -xf /tmp/protox.tar -C /
SLOP patti build --offline --manifest-path /tmp/protox/source/Cargo.toml --bin protox --features bin --cache /tmp/protox/cache --target-dir /tmp/protox/build
SLOP cp /tmp/protox/build/protox /usr/bin/protox
SLOP mkdir -p /usr/share/licenses/protox /usr/share/dolly/builds
SLOP cp /tmp/protox/source/LICENSE-APACHE /usr/share/licenses/protox/LICENSE-APACHE
SLOP cp /tmp/protox/source/LICENSE-MIT /usr/share/licenses/protox/LICENSE-MIT
SLOP cp /tmp/protox/build/patti-build.json /usr/share/dolly/builds/protox.json
SLOP rm -rf /tmp/protox /tmp/protox.tar

EXPORTS TOOL protox
EXPORTS FOLDER protox-licenses /usr/share/licenses/protox
FILE /usr/share/dolly/builds/protox.json
FILE /tmp/protox-check.proto
    syntax = "proto3";
    message DollyCheck { string value = 1; }
SLOP protox -I /tmp -o /tmp/protox-check.pb /tmp/protox-check.proto
SLOP test -s /tmp/protox-check.pb
SLOP rm /tmp/protox-check.proto /tmp/protox-check.pb
