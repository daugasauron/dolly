DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep b09f9c1018dddca78698edfd526a5fbc7f5422dedf7e3bdd699e5079eb91e629 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep b09f9c1018dddca78698edfd526a5fbc7f5422dedf7e3bdd699e5079eb91e629 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep b09f9c1018dddca78698edfd526a5fbc7f5422dedf7e3bdd699e5079eb91e629 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 65b0ee9b01cb3d68140454f8e67bd0922c29404131c6e1bd1962bac125fc356a /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 65b0ee9b01cb3d68140454f8e67bd0922c29404131c6e1bd1962bac125fc356a /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 65b0ee9b01cb3d68140454f8e67bd0922c29404131c6e1bd1962bac125fc356a /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
