DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep c6c980e0742fa85b1784d9820758631b2c8684f7e2a2bca4f2b9398af6a32e29 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep c6c980e0742fa85b1784d9820758631b2c8684f7e2a2bca4f2b9398af6a32e29 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep c6c980e0742fa85b1784d9820758631b2c8684f7e2a2bca4f2b9398af6a32e29 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 27593cd58cada7d10b82aa40d65b5a20ca53e27601b33ac50804550677a769be /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 27593cd58cada7d10b82aa40d65b5a20ca53e27601b33ac50804550677a769be /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 27593cd58cada7d10b82aa40d65b5a20ca53e27601b33ac50804550677a769be /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
