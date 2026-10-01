DOLLY 5
MODULE search-tools

REQUIRES HOST threads@0

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 0c6f66b8e429869ea716314f22e9df2a928acf1b038f4a11f515093c7cfdf3e7 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 0c6f66b8e429869ea716314f22e9df2a928acf1b038f4a11f515093c7cfdf3e7 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 0c6f66b8e429869ea716314f22e9df2a928acf1b038f4a11f515093c7cfdf3e7 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 34d8407314352ed3e3bcc15b59d40a8a408b143c1331eaaa1bf74160532adf6a /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 34d8407314352ed3e3bcc15b59d40a8a408b143c1331eaaa1bf74160532adf6a /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 34d8407314352ed3e3bcc15b59d40a8a408b143c1331eaaa1bf74160532adf6a /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
