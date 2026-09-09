DOLLY 3
MODULE ripgrep

REQUIRES TOOL patti
REQUIRES TOOL tar
REQUIRES TOOL cp
REQUIRES TOOL mkdir
REQUIRES TOOL rm

# Archives contain upstream source and checksum-verified locked crate archives.
SOURCE HOST /static/rust/ripgrep.tar /tmp/ripgrep.tar a836e0f7415d53cc6e99f1b9ef5112bd70d3acd4f0cd5cbff3c8bde46dc6daa7
SLOP tar -xf /tmp/ripgrep.tar -C /
SLOP patti build --offline --manifest-path /tmp/ripgrep/source/Cargo.toml --bin rg --patch libc=/opt/rust-sdk/src/libc --cache /tmp/ripgrep/cache --target-dir /tmp/ripgrep/build
SLOP cp /tmp/ripgrep/build/rg /usr/bin/rg
SLOP mkdir -p /usr/share/licenses/ripgrep /usr/share/dolly/builds
SLOP cp /tmp/ripgrep/source/LICENSE-MIT /usr/share/licenses/ripgrep/LICENSE-MIT
SLOP cp /tmp/ripgrep/source/UNLICENSE /usr/share/licenses/ripgrep/UNLICENSE
SLOP cp /tmp/ripgrep/build/patti-build.json /usr/share/dolly/builds/ripgrep.json
SLOP rm -rf /tmp/ripgrep /tmp/ripgrep.tar

EXPORTS TOOL rg
EXPORTS FOLDER ripgrep-licenses /usr/share/licenses/ripgrep
FILE /usr/share/dolly/builds/ripgrep.json
SLOP rg --version
