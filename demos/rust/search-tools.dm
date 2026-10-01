DOLLY 5
MODULE search-tools

REQUIRES HOST threads@0

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 806b26465151233fdf52c327f58fe8167831de9aae61b7379a44040d17dc1e75 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 806b26465151233fdf52c327f58fe8167831de9aae61b7379a44040d17dc1e75 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-ripgrep 806b26465151233fdf52c327f58fe8167831de9aae61b7379a44040d17dc1e75 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 6799fd4a72940c1781dd763612c3821d15e42b1113e3608b02e8834febace4ca /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 6799fd4a72940c1781dd763612c3821d15e42b1113e3608b02e8834febace4ca /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/demos/rust/Dollyfile-fd-build 6799fd4a72940c1781dd763612c3821d15e42b1113e3608b02e8834febace4ca /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
