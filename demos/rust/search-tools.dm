DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 13b2c571d42f9ce96e81a69b38fff2883cf18b069b8a5d39db4c5e396d917e17 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 13b2c571d42f9ce96e81a69b38fff2883cf18b069b8a5d39db4c5e396d917e17 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 13b2c571d42f9ce96e81a69b38fff2883cf18b069b8a5d39db4c5e396d917e17 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 78759d4400553819cea93428722cf6864b853dfcd92517af3523f5a325ae539a /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 78759d4400553819cea93428722cf6864b853dfcd92517af3523f5a325ae539a /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 78759d4400553819cea93428722cf6864b853dfcd92517af3523f5a325ae539a /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
