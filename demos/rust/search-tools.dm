DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 7dd3dce0a369be6bda0617d32e36303c278fae39152982765f1e907af50670dd /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 7dd3dce0a369be6bda0617d32e36303c278fae39152982765f1e907af50670dd /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 7dd3dce0a369be6bda0617d32e36303c278fae39152982765f1e907af50670dd /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 36a84e483ea145eb0a1ac76927179462db768837b2739ca57601a642077c35d6 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 36a84e483ea145eb0a1ac76927179462db768837b2739ca57601a642077c35d6 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 36a84e483ea145eb0a1ac76927179462db768837b2739ca57601a642077c35d6 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
