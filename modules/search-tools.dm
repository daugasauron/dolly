DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 092a140fd43a73a9d94b53cf682bdf40476d24c82ce1492a8d1d703e0da11b04 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 092a140fd43a73a9d94b53cf682bdf40476d24c82ce1492a8d1d703e0da11b04 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 092a140fd43a73a9d94b53cf682bdf40476d24c82ce1492a8d1d703e0da11b04 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build 2510a18f0f27fa06d82359f6bd7bed29b0f184438318b0ef84edd52bb440a42b /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build 2510a18f0f27fa06d82359f6bd7bed29b0f184438318b0ef84edd52bb440a42b /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build 2510a18f0f27fa06d82359f6bd7bed29b0f184438318b0ef84edd52bb440a42b /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
