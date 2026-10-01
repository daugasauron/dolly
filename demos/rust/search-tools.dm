DOLLY 5
MODULE search-tools

REQUIRES HOST threads@0

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep dbe5ecc5b8bf55663ed81c4536c36bc93e9d2e5335121dfe452cef1e28188b90 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep dbe5ecc5b8bf55663ed81c4536c36bc93e9d2e5335121dfe452cef1e28188b90 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep dbe5ecc5b8bf55663ed81c4536c36bc93e9d2e5335121dfe452cef1e28188b90 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 5ec565a07a9557122c7202615381126240dc13c153fdffba61a3ce658e5aacde /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 5ec565a07a9557122c7202615381126240dc13c153fdffba61a3ce658e5aacde /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 5ec565a07a9557122c7202615381126240dc13c153fdffba61a3ce658e5aacde /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
