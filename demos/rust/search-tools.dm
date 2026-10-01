DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep f0db6bb6607d8e14cb0edd881069a32b6ac447841b3c3f294f61b29cfec4298b /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep f0db6bb6607d8e14cb0edd881069a32b6ac447841b3c3f294f61b29cfec4298b /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep f0db6bb6607d8e14cb0edd881069a32b6ac447841b3c3f294f61b29cfec4298b /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 35d16942356775e20f958683a9ce5fe5bad93a6ff42b1d88b51b3d3aedf917bf /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 35d16942356775e20f958683a9ce5fe5bad93a6ff42b1d88b51b3d3aedf917bf /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 35d16942356775e20f958683a9ce5fe5bad93a6ff42b1d88b51b3d3aedf917bf /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
