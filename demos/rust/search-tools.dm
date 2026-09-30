DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 6eb5b332359d4bd98b790083c1243211c5d8e5adf5d8f7a87536a62c00e83a7d /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 6eb5b332359d4bd98b790083c1243211c5d8e5adf5d8f7a87536a62c00e83a7d /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 6eb5b332359d4bd98b790083c1243211c5d8e5adf5d8f7a87536a62c00e83a7d /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build e117d23a8bd7140696f69bbea6dc0ad7899cd7b1713a9d5b45249b4d19b1669f /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build e117d23a8bd7140696f69bbea6dc0ad7899cd7b1713a9d5b45249b4d19b1669f /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build e117d23a8bd7140696f69bbea6dc0ad7899cd7b1713a9d5b45249b4d19b1669f /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
