DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3d0e11b46ac07e37fdcdcf1d349330618061f1a5a33ecb39b88d2fa1500092ca /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3d0e11b46ac07e37fdcdcf1d349330618061f1a5a33ecb39b88d2fa1500092ca /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3d0e11b46ac07e37fdcdcf1d349330618061f1a5a33ecb39b88d2fa1500092ca /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 08597c5bd02a536c277d6a85ffaa5146b261adb6520c29b5e0d1bde44ce60635 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 08597c5bd02a536c277d6a85ffaa5146b261adb6520c29b5e0d1bde44ce60635 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 08597c5bd02a536c277d6a85ffaa5146b261adb6520c29b5e0d1bde44ce60635 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
