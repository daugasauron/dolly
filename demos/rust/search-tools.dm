DOLLY 5
MODULE search-tools

REQUIRES HOST threads@0

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 40404ed5c59449b67293843903b7174bbaceb90006323527e37ce64daac63517 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 40404ed5c59449b67293843903b7174bbaceb90006323527e37ce64daac63517 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 40404ed5c59449b67293843903b7174bbaceb90006323527e37ce64daac63517 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build bbd45b5b5627a01c8c5102f34e47a94eeb565bd00f7f904854a38b3d93e0337f /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build bbd45b5b5627a01c8c5102f34e47a94eeb565bd00f7f904854a38b3d93e0337f /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build bbd45b5b5627a01c8c5102f34e47a94eeb565bd00f7f904854a38b3d93e0337f /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
