DOLLY 5
MODULE search-tools

REQUIRES HOST threads@0

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep a8a03e12845d1c64088c4fed3c0a0263740775498985b0ba459291b616ecd0fe /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep a8a03e12845d1c64088c4fed3c0a0263740775498985b0ba459291b616ecd0fe /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep a8a03e12845d1c64088c4fed3c0a0263740775498985b0ba459291b616ecd0fe /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build f77b8dcda129350b2670021bba3c980adf496dab9f0264d2ad59542acb2f84fa /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build f77b8dcda129350b2670021bba3c980adf496dab9f0264d2ad59542acb2f84fa /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build f77b8dcda129350b2670021bba3c980adf496dab9f0264d2ad59542acb2f84fa /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
