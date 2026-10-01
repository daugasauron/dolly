DOLLY 5
MODULE search-tools

REQUIRES HOST threads@0

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep d3d47f6f91f3aa5eb6bee87bb98ad130bce8131d48d156bbfcbe50c5e05c2707 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep d3d47f6f91f3aa5eb6bee87bb98ad130bce8131d48d156bbfcbe50c5e05c2707 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep d3d47f6f91f3aa5eb6bee87bb98ad130bce8131d48d156bbfcbe50c5e05c2707 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build deb8c24e070cb5273d9aecc715fe003e7b629486fb01d6b630aaeaa57e115e2b /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build deb8c24e070cb5273d9aecc715fe003e7b629486fb01d6b630aaeaa57e115e2b /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build deb8c24e070cb5273d9aecc715fe003e7b629486fb01d6b630aaeaa57e115e2b /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
