DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep d86581f0832038bd649ace3dcc92023ce54f91a61b922f0acd31f224e6aa515f /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep d86581f0832038bd649ace3dcc92023ce54f91a61b922f0acd31f224e6aa515f /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep d86581f0832038bd649ace3dcc92023ce54f91a61b922f0acd31f224e6aa515f /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 175ab461bf704574a4c9be5b2d564cf6ee20fbfe5e530450f9d10780a29619e7 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 175ab461bf704574a4c9be5b2d564cf6ee20fbfe5e530450f9d10780a29619e7 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 175ab461bf704574a4c9be5b2d564cf6ee20fbfe5e530450f9d10780a29619e7 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
