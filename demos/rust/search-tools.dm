DOLLY 5
MODULE search-tools

REQUIRES HOST threads@0

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 85200754a88bcab2e0ffa905884ad5245a97629e5f7d1a91d1a764882c80961f /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 85200754a88bcab2e0ffa905884ad5245a97629e5f7d1a91d1a764882c80961f /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 85200754a88bcab2e0ffa905884ad5245a97629e5f7d1a91d1a764882c80961f /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 0b57f24d92479dfb10b28089746d6f46561134da5b9889128f4aae29592cdaa8 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 0b57f24d92479dfb10b28089746d6f46561134da5b9889128f4aae29592cdaa8 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 0b57f24d92479dfb10b28089746d6f46561134da5b9889128f4aae29592cdaa8 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
