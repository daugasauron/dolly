DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep c04d558c6a02e6f92e028bdb896d053fbb1cf45a17ada05cf3023f1be5396334 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep c04d558c6a02e6f92e028bdb896d053fbb1cf45a17ada05cf3023f1be5396334 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep c04d558c6a02e6f92e028bdb896d053fbb1cf45a17ada05cf3023f1be5396334 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build 743f39b58a0a2fc2cd212643623ab6d0c5e4a5ff26ed50744cd61306696f0430 /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build 743f39b58a0a2fc2cd212643623ab6d0c5e4a5ff26ed50744cd61306696f0430 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build 743f39b58a0a2fc2cd212643623ab6d0c5e4a5ff26ed50744cd61306696f0430 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
