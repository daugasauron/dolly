DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep d5d730c17f08640fe7523041000b1d673aa51046f58644ffc7b3a6a65f48020f /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep d5d730c17f08640fe7523041000b1d673aa51046f58644ffc7b3a6a65f48020f /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep d5d730c17f08640fe7523041000b1d673aa51046f58644ffc7b3a6a65f48020f /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build fcd2a9e458e70105baaabef6b948e70170c96be6fb7379917fedc28022f5c010 /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build fcd2a9e458e70105baaabef6b948e70170c96be6fb7379917fedc28022f5c010 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build fcd2a9e458e70105baaabef6b948e70170c96be6fb7379917fedc28022f5c010 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
