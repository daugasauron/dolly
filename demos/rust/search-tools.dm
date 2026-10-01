DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 42ece295cf67c1f74032737bbbd724e606d75cf876a50480e09117986d5dfafb /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 42ece295cf67c1f74032737bbbd724e606d75cf876a50480e09117986d5dfafb /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 42ece295cf67c1f74032737bbbd724e606d75cf876a50480e09117986d5dfafb /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 032e0f430be84930ae8d2ec2b63fb418c72d4850e2e291d3e9462446768c7acd /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 032e0f430be84930ae8d2ec2b63fb418c72d4850e2e291d3e9462446768c7acd /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 032e0f430be84930ae8d2ec2b63fb418c72d4850e2e291d3e9462446768c7acd /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
